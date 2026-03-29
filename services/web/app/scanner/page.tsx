'use client';

import { useState, type FormEvent } from 'react';
import { Nav } from '@/components/nav';
import { useWalletAuth } from '@/components/auth/wallet-auth-context';
import { useNFC } from '@/hooks/useNFC';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowRightLeft, Package, Search, Waves } from 'lucide-react';
import { harvestProducerBatch, initiateBatchTransferById, receiveTransferredBatchById } from '@/lib/chainproof-write';
import { readBatchByTrackingOrId, readPredictedNextBatchId } from '@/lib/chainproof-read';
import type { AppRole } from '@/lib/wallet-auth';

type TxFeedback = {
  type: 'success' | 'error';
  message: string;
  txHash?: string;
};

type HarvestFeedback = {
  type: 'success' | 'error';
  message: string;
  txHash?: string;
};

type NfcSnapshot = {
  tempMin: number | null;
  tempMax: number | null;
  humiMin: number | null;
  humiMax: number | null;
  flag2: number | null;
  hasBatchId: boolean;
  batchId: number | null;
  raw: string;
};

const parseSemicolonKv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((segment) => {
      const idx = segment.indexOf('=');
      if (idx <= 0) return;
      const key = segment.slice(0, idx).trim();
      const value = segment.slice(idx + 1).trim();
      if (!key) return;
      out[key] = value;
    });
  return out;
};

const parseActiveBatchIdFromTagText = (text: string): number | null => {
  const kv = parseSemicolonKv(text);
  const raw = kv.batch_id;
  if (!raw) return null;
  const numeric = Math.floor(Number(raw));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export default function ScannerPage() {
  const { role, isConnected } = useWalletAuth();
  const { isSupported, isReading, isWriting, lastRead, lastWritten, error, readTag, writeTag } = useNFC();

  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [isScanningBatchId, setIsScanningBatchId] = useState(false);
  const [isAwaitingAck, setIsAwaitingAck] = useState(false);
  const [lastAckPayload, setLastAckPayload] = useState<string | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [isReadingNfc, setIsReadingNfc] = useState(false);
  const [nfcReadError, setNfcReadError] = useState<string | null>(null);
  const [nfcPayloadSnapshot, setNfcPayloadSnapshot] = useState<NfcSnapshot | null>(null);

  const [origin, setOrigin] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [harvestSubmitting, setHarvestSubmitting] = useState(false);
  const [harvestFeedback, setHarvestFeedback] = useState<HarvestFeedback | null>(null);

  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<TxFeedback | null>(null);

  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveFeedback, setReceiveFeedback] = useState<TxFeedback | null>(null);

  const [verifyLookup, setVerifyLookup] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<TxFeedback | null>(null);

  const activeRole: AppRole = isConnected ? role : 'none';

  const loadBatchIdFromScan = async (): Promise<number | null> => {
    if (!isSupported) throw new Error('WebNFC is not supported in this browser.');

    setIsScanningBatchId(true);
    setScanMessage('Scan the NFC tag to read the active batch ID.');
    try {
      const text = await readTag();
      const batchId = parseActiveBatchIdFromTagText(text);
      if (!batchId) throw new Error('Scanned tag does not contain a valid batch_id.');
      setActiveBatchId(batchId);
      setScanMessage(`Active batch loaded from tag: ${batchId}.`);
      return batchId;
    } finally {
      setIsScanningBatchId(false);
    }
  };

  const readNfcPayloadSnapshot = async () => {
    if (!isSupported) {
      setNfcReadError('WebNFC is not supported in this browser.');
      return;
    }

    setIsReadingNfc(true);
    setNfcReadError(null);
    try {
      const text = await readTag();
      const kv = parseSemicolonKv(text);
      const batchId = parseActiveBatchIdFromTagText(text);
      const snapshot: NfcSnapshot = {
        tempMin: kv.temp_min ? Number(kv.temp_min) : null,
        tempMax: kv.temp_max ? Number(kv.temp_max) : null,
        humiMin: kv.humi_min ? Number(kv.humi_min) : null,
        humiMax: kv.humi_max ? Number(kv.humi_max) : null,
        flag2: kv.flag ? Number(kv.flag) : null,
        hasBatchId: Boolean(batchId),
        batchId,
        raw: text,
      };
      setNfcPayloadSnapshot(snapshot);
      if (batchId) setActiveBatchId(batchId);
    } catch (readErr) {
      setNfcReadError(readErr instanceof Error ? readErr.message : 'Failed to read NFC payload.');
    } finally {
      setIsReadingNfc(false);
    }
  };

  const handleCreateBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHarvestSubmitting(true);
    setHarvestFeedback(null);
    setLastAckPayload(null);

    if (!isSupported) {
      setHarvestFeedback({
        type: 'error',
        message: 'WebNFC is not available in this browser/device.',
      });
      setHarvestSubmitting(false);
      return;
    }

    try {
      const quantity = Number(quantityInput);
      const stagedBatchId = await readPredictedNextBatchId();
      const nonce = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
      const command = `cmd=activate_batch;batch_id=${stagedBatchId};nonce=${nonce}`;

      setScanMessage('Tap NFC tag now to write activation command.');
      await writeTag(command);

      setIsAwaitingAck(true);
      setScanMessage('Activation command written. Tap same tag again to read hardware ACK.');
      const ackText = await readTag();
      setLastAckPayload(ackText);

      const ackKv = parseSemicolonKv(ackText);
      const ackBatchId = parseActiveBatchIdFromTagText(ackText);
      const isValidAck =
        ackKv.ack === 'activate_batch' &&
        ackKv.status === 'ok' &&
        ackKv.nonce === nonce &&
        ackBatchId === stagedBatchId;

      if (!isValidAck) {
        throw new Error('Hardware ACK missing or invalid. Batch creation was not submitted to blockchain.');
      }

      const result = await harvestProducerBatch({
        origin,
        quantity,
        trackingCode,
      });

      setHarvestFeedback({
        type: 'success',
        message: `Batch ${result.newBatchId ?? stagedBatchId} harvested on-chain successfully.`,
        txHash: result.txHash,
      });
      setOrigin('');
      setTrackingCode('');
      setQuantityInput('');
      setActiveBatchId(result.newBatchId ?? stagedBatchId);
    } catch (errorObj) {
      const message = errorObj instanceof Error ? errorObj.message : 'Failed to create batch.';
      setHarvestFeedback({
        type: 'error',
        message,
      });
    } finally {
      setIsAwaitingAck(false);
      setHarvestSubmitting(false);
    }
  };

  const handleTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTransferSubmitting(true);
    setTransferFeedback(null);

    try {
      let batchId = activeBatchId;
      if (!batchId) {
        batchId = await loadBatchIdFromScan();
      }
      if (!batchId) throw new Error('No active batch id found on NFC tag.');
      setActiveBatchId(batchId);
      const result = await initiateBatchTransferById({
        batchId,
        to: transferRecipient,
      });
      setTransferFeedback({
        type: 'success',
        message: `Transfer initiated for batch ${result.batchId}.`,
        txHash: result.txHash,
      });
      setTransferRecipient('');
    } catch (err) {
      setTransferFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Transfer initiation failed.',
      });
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleReceive = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReceiveSubmitting(true);
    setReceiveFeedback(null);

    try {
      let batchId = activeBatchId;
      if (!batchId) {
        batchId = await loadBatchIdFromScan();
      }
      if (!batchId) throw new Error('No active batch id found on NFC tag.');
      setActiveBatchId(batchId);
      const result = await receiveTransferredBatchById({ batchId });
      setReceiveFeedback({
        type: 'success',
        message: `Batch ${result.batchId} received successfully.`,
        txHash: result.txHash,
      });
    } catch (err) {
      setReceiveFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Receive transaction failed.',
      });
    } finally {
      setReceiveSubmitting(false);
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVerifySubmitting(true);
    setVerifyFeedback(null);

    try {
      const result = await readBatchByTrackingOrId(verifyLookup);
      setVerifyFeedback({
        type: 'success',
        message: `Verified batch ${result.batch.id} (${result.batch.trackingCode || 'no tracking code'}) on chain ${result.chainId}.`,
      });
    } catch (err) {
      setVerifyFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Verification failed.',
      });
    } finally {
      setVerifySubmitting(false);
    }
  };

  const renderTxFeedback = (feedback: TxFeedback | null) => {
    if (!feedback) return null;
    return (
      <p className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
        {feedback.message}
        {feedback.txHash ? ` tx: ${feedback.txHash}` : ''}
      </p>
    );
  };

  const renderTransferForm = (prefix: string, title = 'Initiate Transfer') => (
    <form onSubmit={handleTransfer} className="space-y-3 rounded-lg border bg-white p-4">
      <h4 className="font-semibold text-gray-900">{title}</h4>
      <p className="text-xs text-slate-600">Active hardware batch ID: {activeBatchId ?? 'Not loaded'}</p>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-transfer-recipient`}>Recipient wallet</Label>
        <Input
          id={`${prefix}-transfer-recipient`}
          value={transferRecipient}
          onChange={(event) => setTransferRecipient(event.target.value)}
          placeholder="0x..."
          disabled={transferSubmitting}
        />
      </div>
      {renderTxFeedback(transferFeedback)}
      <Button className="w-full" disabled={transferSubmitting || !activeBatchId || !transferRecipient.trim()}>
        <ArrowRightLeft className="mr-2 h-4 w-4" />
        {transferSubmitting ? 'Submitting...' : 'Initiate Transfer'}
      </Button>
    </form>
  );

  const renderReceiveForm = (prefix: string, title = 'Receive Batch') => (
    <form onSubmit={handleReceive} className="space-y-3 rounded-lg border bg-white p-4">
      <h4 className="font-semibold text-gray-900">{title}</h4>
      <p className="text-xs text-slate-600">Active hardware batch ID: {activeBatchId ?? 'Not loaded'}</p>
      {renderTxFeedback(receiveFeedback)}
      <Button className="w-full" disabled={receiveSubmitting || !activeBatchId}>
        <Package className="mr-2 h-4 w-4" />
        {receiveSubmitting ? 'Submitting...' : 'Receive Batch'}
      </Button>
    </form>
  );

  const renderRoleActions = () => {
    if (activeRole === 'none') {
      return (
        <p className="text-sm text-gray-600">
          Sign in with a wallet and assign a role to enable role-specific actions.
        </p>
      );
    }

    if (activeRole === 'producer') {
      return (
        <div className="space-y-4">
          <form onSubmit={handleCreateBatch} className="space-y-3 rounded-lg border bg-white p-4">
            <h4 className="font-semibold text-gray-900">Create New Batch</h4>
            <p className="text-xs text-slate-600">NFC scan is required to activate hardware batch before on-chain create.</p>
            <div className="space-y-2">
              <Label htmlFor="producer-origin">Origin / Product Label</Label>
              <Input
                id="producer-origin"
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                placeholder="e.g., Ethiopia - Yirgacheffe"
                disabled={harvestSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="producer-tracking-code">Tracking Code</Label>
              <Input
                id="producer-tracking-code"
                value={trackingCode}
                onChange={(event) => setTrackingCode(event.target.value)}
                placeholder="e.g., BATCH-2026-001"
                disabled={harvestSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="producer-quantity">Weight (kg)</Label>
              <Input
                id="producer-quantity"
                type="number"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.target.value)}
                placeholder="e.g., 100"
                min={1}
                disabled={harvestSubmitting}
              />
            </div>
            {harvestFeedback ? (
              <p className={`text-sm ${harvestFeedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
                {harvestFeedback.message}
                {harvestFeedback.txHash ? ` tx: ${harvestFeedback.txHash}` : ''}
              </p>
            ) : null}
            {lastAckPayload ? <p className="break-all text-xs text-slate-600">Last ACK: {lastAckPayload}</p> : null}
            <Button className="w-full" disabled={harvestSubmitting || !isSupported}>
              <Package className="mr-2 h-4 w-4" />
              {harvestSubmitting ? (isAwaitingAck ? 'Waiting for ACK...' : 'Submitting...') : 'Create Batch'}
            </Button>
          </form>
          {renderTransferForm('producer')}
        </div>
      );
    }

    if (activeRole === 'transporter') {
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          {renderReceiveForm('transporter', 'Receive Shipment')}
          {renderTransferForm('transporter', 'Deliver Shipment')}
        </div>
      );
    }

    if (activeRole === 'warehouse') {
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          {renderReceiveForm('warehouse')}
          {renderTransferForm('warehouse', 'Transfer Batch')}
        </div>
      );
    }

    if (activeRole === 'processor') {
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          {renderTransferForm('processor')}
          {renderReceiveForm('processor')}
        </div>
      );
    }

    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={handleVerify} className="space-y-3 rounded-lg border bg-white p-4">
          <h4 className="font-semibold text-gray-900">Verify Batch</h4>
          <div className="space-y-2">
            <Label htmlFor="customer-verify-lookup">Batch ID or tracking code</Label>
            <Input
              id="customer-verify-lookup"
              value={verifyLookup}
              onChange={(event) => setVerifyLookup(event.target.value)}
              placeholder="e.g., 12 or BATCH-2026-001"
              disabled={verifySubmitting}
            />
          </div>
          {renderTxFeedback(verifyFeedback)}
          <Button className="w-full" disabled={verifySubmitting || !verifyLookup.trim()}>
            <Search className="mr-2 h-4 w-4" />
            {verifySubmitting ? 'Verifying...' : 'Verify Batch'}
          </Button>
        </form>
        {renderReceiveForm('customer')}
      </div>
    );
  };

  const roleLabel = activeRole === 'none' ? 'No role assigned' : activeRole;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>NFC Console</CardTitle>
            <CardDescription>
              NFC-only workflow: producer writes activation command, hardware acknowledges, then blockchain harvest is submitted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isSupported ? 'success' : 'outline'}>{isSupported ? 'WebNFC supported' : 'WebNFC unavailable'}</Badge>
              <Badge variant={isConnected ? 'secondary' : 'warning'}>{isConnected ? `Role: ${roleLabel}` : 'Wallet disconnected'}</Badge>
              <Badge variant={activeBatchId ? 'success' : 'outline'}>{activeBatchId ? `Active batch: ${activeBatchId}` : 'No active batch loaded'}</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void readNfcPayloadSnapshot()}
                disabled={!isSupported || isReadingNfc || isReading}
              >
                <Waves className="mr-2 h-4 w-4" />
                {isReadingNfc || isReading ? 'Reading...' : 'Read Tag Snapshot'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void loadBatchIdFromScan()}
                disabled={!isSupported || isScanningBatchId || isReading}
              >
                {isScanningBatchId ? 'Scanning...' : 'Scan Batch ID'}
              </Button>
            </div>

            {scanMessage ? <p className="text-sm text-slate-700">{scanMessage}</p> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {nfcReadError ? <p className="text-sm text-red-600">{nfcReadError}</p> : null}
            {isWriting ? <p className="text-xs text-slate-600">Writing NFC command...</p> : null}
            {lastWritten ? <p className="break-all text-xs text-slate-600">Last written command: {lastWritten}</p> : null}
            {lastRead ? <p className="break-all text-xs text-slate-600">Last scanned payload: {lastRead}</p> : null}

            {nfcPayloadSnapshot ? (
              <div className="rounded-md border bg-green-50 p-3 text-xs text-green-900">
                <p className="font-semibold">Latest payload snapshot</p>
                <p className="mt-1">Temp min: {nfcPayloadSnapshot.tempMin ?? 'n/a'} C</p>
                <p>Temp max: {nfcPayloadSnapshot.tempMax ?? 'n/a'} C</p>
                <p>Humidity min: {nfcPayloadSnapshot.humiMin ?? 'n/a'} %</p>
                <p>Humidity max: {nfcPayloadSnapshot.humiMax ?? 'n/a'} %</p>
                <p>Flag: {nfcPayloadSnapshot.flag2 ?? 'n/a'}</p>
                <p>Batch ID: {nfcPayloadSnapshot.hasBatchId ? nfcPayloadSnapshot.batchId : 'Not set'}</p>
                <p className="break-all">Raw: {nfcPayloadSnapshot.raw}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">{renderRoleActions()}</CardContent>
        </Card>
      </main>
    </div>
  );
}
