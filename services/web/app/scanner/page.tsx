'use client';

import { useState, type FormEvent } from 'react';
import { Nav } from '@/components/nav';
import { useWalletAuth } from '@/components/auth/wallet-auth-provider';
import { useNfcBleBridge } from '@/hooks/useNfcBleBridge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowRightLeft, Bluetooth, CheckCircle, Package, Search, Waves } from 'lucide-react';
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

export default function ScannerPage() {
  const { role, isConnected } = useWalletAuth();
  const {
    isConnecting,
    isNfcConnected,
    nfcDeviceName,
    nfcDeviceId,
    connectionError,
    isReadingNfc,
    nfcReadError,
    nfcPayloadSnapshot,
    blePhase,
    lastSuccessfulBlePhase,
    lastBleErrorName,
    lastBleErrorMessage,
    connectNfcDevice,
    readNfcPayloadSnapshot,
    readActiveBatchIdFromHardware,
    setActiveBatchOnHardware,
    clearActiveBatchOnHardware,
    disconnectNfcDevice,
  } = useNfcBleBridge();

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
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);

  const [verifyLookup, setVerifyLookup] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<TxFeedback | null>(null);

  const activeRole: AppRole = isConnected ? role : 'none';

  const handleCreateBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHarvestSubmitting(true);
    setHarvestFeedback(null);

    if (!isNfcConnected) {
      setHarvestFeedback({
        type: 'error',
        message: 'Connect an NFC device before creating a batch.',
      });
      setHarvestSubmitting(false);
      return;
    }

    let stagedBatchId: number | null = null;
    let wroteHardware = false;

    try {
      const quantity = Number(quantityInput);
      stagedBatchId = await readPredictedNextBatchId();
      await setActiveBatchOnHardware(stagedBatchId);
      wroteHardware = true;

      const result = await harvestProducerBatch({
        origin,
        quantity,
        trackingCode,
      });

      setHarvestFeedback({
        type: 'success',
        message: `Batch ${result.newBatchId ?? 'pending'} harvested on-chain successfully.`,
        txHash: result.txHash,
      });
      setOrigin('');
      setTrackingCode('');
      setQuantityInput('');
      setActiveBatchId(result.newBatchId ?? stagedBatchId);
    } catch (error) {
      if (wroteHardware) {
        try {
          await clearActiveBatchOnHardware();
        } catch {
          // Best-effort rollback if on-chain creation fails after hardware staging.
        }
      }
      const message = error instanceof Error ? error.message : 'Failed to create batch.';
      setHarvestFeedback({
        type: 'error',
        message: stagedBatchId ? `${message} Hardware rollback was attempted.` : message,
      });
    } finally {
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
        batchId = await readActiveBatchIdFromHardware();
      }
      if (!batchId) throw new Error('No active batch id found on connected hardware.');
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
        batchId = await readActiveBatchIdFromHardware();
      }
      if (!batchId) throw new Error('No active batch id found on connected hardware.');
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
      <Button className="w-full" disabled={transferSubmitting || !isNfcConnected || !activeBatchId || !transferRecipient.trim()}>
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
      <Button className="w-full" disabled={receiveSubmitting || !isNfcConnected || !activeBatchId}>
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
            <p className="text-xs text-slate-600">Batch creation is available in NFC Console only.</p>
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
              <Label htmlFor="producer-quantity">Quantity</Label>
              <Input
                id="producer-quantity"
                type="number"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.target.value)}
                placeholder="e.g., 5000"
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
            <Button className="w-full" disabled={harvestSubmitting || !isNfcConnected}>
              <Package className="mr-2 h-4 w-4" />
              {harvestSubmitting ? 'Submitting...' : 'Create Batch'}
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
            <CardTitle>NFC Console Connection</CardTitle>
            <CardDescription>
              Temporary BLE bridge for NFC workflow testing. Final production behavior will switch to NFC.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isNfcConnected ? 'success' : 'outline'}>
                {isNfcConnected ? 'NFC device connected' : 'NFC device not connected'}
              </Badge>
              <Badge variant={isConnected ? 'secondary' : 'warning'}>{isConnected ? `Role: ${roleLabel}` : 'Wallet disconnected'}</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void connectNfcDevice()} disabled={isConnecting || isNfcConnected}>
                <Bluetooth className="mr-2 h-4 w-4" />
                {isConnecting ? 'Connecting...' : 'Connect NFC Device'}
              </Button>
              <Button variant="secondary" onClick={() => void readNfcPayloadSnapshot()} disabled={!isNfcConnected || isReadingNfc}>
                <Waves className="mr-2 h-4 w-4" />
                {isReadingNfc ? 'Reading...' : 'Read Payload Snapshot'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void readActiveBatchIdFromHardware().then((id) => setActiveBatchId(id))}
                disabled={!isNfcConnected || isReadingNfc}
              >
                Load Batch ID
              </Button>
              <Button variant="outline" onClick={disconnectNfcDevice} disabled={!isNfcConnected}>
                Disconnect
              </Button>
            </div>

            {isNfcConnected ? (
              <p className="text-sm text-gray-700">
                Connected to <span className="font-semibold">{nfcDeviceName || 'Unnamed ESP32'}</span>
                {nfcDeviceId ? ` (${nfcDeviceId})` : ''}.
              </p>
            ) : null}

            {connectionError ? <p className="text-sm text-red-600">{connectionError}</p> : null}
            {nfcReadError ? <p className="text-sm text-red-600">{nfcReadError}</p> : null}

            {nfcPayloadSnapshot ? (
              <div className="rounded-md border bg-green-50 p-3 text-xs text-green-900">
                <p className="font-semibold">Latest payload snapshot</p>
                <p className="mt-1">Temp range: {nfcPayloadSnapshot.tempMin.toFixed(2)} to {nfcPayloadSnapshot.tempMax.toFixed(2)} C</p>
                <p>Humidity range: {nfcPayloadSnapshot.humiMin.toFixed(2)} to {nfcPayloadSnapshot.humiMax.toFixed(2)} %</p>
                <p>Flag: {nfcPayloadSnapshot.flag2}</p>
                <p>Batch ID: {nfcPayloadSnapshot.hasBatchId ? nfcPayloadSnapshot.batchId : 'Not set'}</p>
                <p>Payload bytes: {nfcPayloadSnapshot.byteLength}</p>
              </div>
            ) : null}

            <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">BLE Diagnostics</p>
              <p className="mt-1">Current phase: {blePhase}</p>
              <p>Last successful phase: {lastSuccessfulBlePhase}</p>
              <p>Last error name: {lastBleErrorName ?? 'None'}</p>
              <p className="break-all">Last error details: {lastBleErrorMessage ?? 'None'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="mr-2 h-5 w-5 text-blue-600" />
              Role Action
            </CardTitle>
            <CardDescription>
              Batch creation and role actions run from NFC Console for the current BLE workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>{renderRoleActions()}</CardContent>
        </Card>
      </main>
    </div>
  );
}
