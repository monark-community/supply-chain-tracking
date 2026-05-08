'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/nav';
import { useWalletAuth } from '@/components/auth/wallet-auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowRightLeft, ExternalLink, Package, Search } from 'lucide-react';
import {
  harvestProducerBatch,
  initiateBatchTransferById,
  PendingTxTimeoutError,
  receiveTransferredBatchById,
} from '@/lib/chainproof-write';
import { readBatchById, readBatchIdByHardwareId } from '@/lib/chainproof-read';
import { consumePendingNfcScan } from '@/lib/nfc-scan-session';
import type { AppRole } from '@/lib/wallet-auth';
import type { ResolvedNfcScanContext } from '@/lib/nfc-scan-payload';

type TxFeedback = {
  type: 'success' | 'error' | 'pending';
  message: string;
  txHash?: string;
};

type PendingScanSnapshot = ResolvedNfcScanContext;

export default function ScannerPage() {
  const router = useRouter();
  const { role, isConnected, account, status, getWriteSession, wakeWalletApp } = useWalletAuth();
  const [scanSnapshot, setScanSnapshot] = useState<PendingScanSnapshot | null>(null);

  useEffect(() => {
    if (!account && status !== 'connecting' && status !== 'idle') {
      router.replace('/');
    }
  }, [account, router, status]);

  const [origin, setOrigin] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [hardwareIdInput, setHardwareIdInput] = useState('');
  const [harvestSubmitting, setHarvestSubmitting] = useState(false);
  const [harvestFeedback, setHarvestFeedback] = useState<TxFeedback | null>(null);
  const [harvestPendingConnector, setHarvestPendingConnector] = useState<string | null>(null);

  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<TxFeedback | null>(null);
  const [transferPendingConnector, setTransferPendingConnector] = useState<string | null>(null);

  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveFeedback, setReceiveFeedback] = useState<TxFeedback | null>(null);
  const [receivePendingConnector, setReceivePendingConnector] = useState<string | null>(null);

  const [verifyLookup, setVerifyLookup] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<TxFeedback | null>(null);

  useEffect(() => {
    const pending = consumePendingNfcScan();
    if (!pending) return;
    setScanSnapshot(pending);
    setHardwareIdInput(pending.hardwareId);
    setVerifyLookup(pending.resolvedBatchId ? String(pending.resolvedBatchId) : '');
  }, []);

  const activeRole: AppRole = isConnected ? role : 'none';
  const activeBatchId = scanSnapshot?.resolvedBatchId && scanSnapshot.resolvedBatchId > 0 ? scanSnapshot.resolvedBatchId : null;

  const scanAgeLabel = useMemo(() => {
    if (!scanSnapshot?.receivedAt) return 'Unknown';
    const seconds = Math.max(0, Math.floor((Date.now() - scanSnapshot.receivedAt) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }, [scanSnapshot]);

  const handleCreateBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHarvestSubmitting(true);
    setHarvestFeedback(null);
    setHarvestPendingConnector(null);
    try {
      const weight = Number(weightInput);
      const hardwareId = hardwareIdInput.trim();
      if (!hardwareId) throw new Error('Hardware id is required for producer harvest binding.');
      const session = await getWriteSession();
      setHarvestPendingConnector(session.connectorId);
      wakeWalletApp(session.connectorId);
      const result = await harvestProducerBatch(
        {
          origin,
          weight,
          hardwareId,
        },
        session
      );
      setHarvestFeedback({
        type: 'success',
        message: `Batch ${result.newBatchId ?? 'created'} harvested and hardware mapping updated on-chain.`,
        txHash: result.txHash,
      });
      const resolvedBatchId =
        result.newBatchId && result.newBatchId > 0 ? result.newBatchId : await readBatchIdByHardwareId(hardwareId);
      if (resolvedBatchId > 0) {
        setScanSnapshot((previous) =>
          previous
            ? {
                ...previous,
                resolvedBatchId,
                mappingStatus: 'mapped',
                verifiedAt: Date.now(),
              }
            : previous
        );
        setVerifyLookup(String(resolvedBatchId));
      }
      setOrigin('');
      setWeightInput('');
    } catch (errorObj) {
      if (errorObj instanceof PendingTxTimeoutError) {
        setHarvestFeedback({
          type: 'pending',
          message:
            'We could not confirm the harvest in time. The transaction may still go through — refresh to verify status.',
        });
      } else {
        setHarvestFeedback({
          type: 'error',
          message: errorObj instanceof Error ? errorObj.message : 'Failed to create batch.',
        });
      }
    } finally {
      setHarvestSubmitting(false);
      setHarvestPendingConnector(null);
    }
  };

  const handleTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTransferSubmitting(true);
    setTransferFeedback(null);
    setTransferPendingConnector(null);
    try {
      if (!activeBatchId) throw new Error('No resolved batch from NFC deep link.');
      const session = await getWriteSession();
      setTransferPendingConnector(session.connectorId);
      wakeWalletApp(session.connectorId);
      const result = await initiateBatchTransferById({ batchId: activeBatchId, to: transferRecipient }, session);
      setTransferFeedback({
        type: 'success',
        message: `Transfer initiated for batch ${result.batchId}.`,
        txHash: result.txHash,
      });
      setTransferRecipient('');
    } catch (err) {
      if (err instanceof PendingTxTimeoutError) {
        setTransferFeedback({
          type: 'pending',
          message:
            'We could not confirm the transfer in time. The transaction may still go through — refresh to verify status.',
        });
      } else {
        setTransferFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Transfer initiation failed.',
        });
      }
    } finally {
      setTransferSubmitting(false);
      setTransferPendingConnector(null);
    }
  };

  const handleReceive = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReceiveSubmitting(true);
    setReceiveFeedback(null);
    setReceivePendingConnector(null);
    try {
      if (!activeBatchId) throw new Error('No resolved batch from NFC deep link.');
      const session = await getWriteSession();
      setReceivePendingConnector(session.connectorId);
      wakeWalletApp(session.connectorId);
      const result = await receiveTransferredBatchById({ batchId: activeBatchId }, session);
      setReceiveFeedback({
        type: 'success',
        message: `Batch ${result.batchId} received successfully.`,
        txHash: result.txHash,
      });
    } catch (err) {
      if (err instanceof PendingTxTimeoutError) {
        setReceiveFeedback({
          type: 'pending',
          message:
            'We could not confirm the receipt in time. The transaction may still go through — refresh to verify status.',
        });
      } else {
        setReceiveFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Receive transaction failed.',
        });
      }
    } finally {
      setReceiveSubmitting(false);
      setReceivePendingConnector(null);
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVerifySubmitting(true);
    setVerifyFeedback(null);
    try {
      const trimmed = verifyLookup.trim() || (activeBatchId ? String(activeBatchId) : '');
      if (!trimmed) throw new Error('No mapped batch is available yet. A producer must harvest/bind this hardware first.');
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
        throw new Error('Enter a valid batch id.');
      }
      const result = await readBatchById(parsed);
      setVerifyFeedback({
        type: 'success',
        message: `Verified batch ${result.batch.id} on chain ${result.chainId}.`,
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
    if (feedback.type === 'pending') {
      return (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{feedback.message}</p>
          {feedback.txHash ? <p className="text-xs break-all">tx: {feedback.txHash}</p> : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
          >
            Refresh page
          </Button>
        </div>
      );
    }
    return (
      <p className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
        {feedback.message}
        {feedback.txHash ? ` tx: ${feedback.txHash}` : ''}
      </p>
    );
  };

  const renderWalletConnectHint = (pendingConnector: string | null) => {
    if (pendingConnector !== 'walletConnect') return null;
    return (
      <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <p className="font-medium">Open MetaMask app to approve the transaction.</p>
        <p>If MetaMask did not open automatically, tap the button below.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => wakeWalletApp(pendingConnector)}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Open MetaMask
        </Button>
      </div>
    );
  };

  const renderTransferForm = (prefix: string, title = 'Initiate Transfer') => (
    <form onSubmit={handleTransfer} className="space-y-3 rounded-lg border bg-white p-4">
      <h4 className="font-semibold text-gray-900">{title}</h4>
      <p className="text-xs text-slate-600">Resolved batch from NFC: {activeBatchId ?? 'Not available'}</p>
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
      {transferSubmitting ? renderWalletConnectHint(transferPendingConnector) : null}
      <Button className="w-full" disabled={transferSubmitting || !activeBatchId || !transferRecipient.trim()}>
        <ArrowRightLeft className="mr-2 h-4 w-4" />
        {transferSubmitting ? 'Submitting...' : 'Initiate Transfer'}
      </Button>
    </form>
  );

  const renderReceiveForm = (prefix: string, title = 'Receive Batch') => (
    <form onSubmit={handleReceive} className="space-y-3 rounded-lg border bg-white p-4">
      <h4 className="font-semibold text-gray-900">{title}</h4>
      <p className="text-xs text-slate-600">Resolved batch from NFC: {activeBatchId ?? 'Not available'}</p>
      {renderTxFeedback(receiveFeedback)}
      {receiveSubmitting ? renderWalletConnectHint(receivePendingConnector) : null}
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
          Sign in and assign a role to run on-chain actions for this hardware scan.
        </p>
      );
    }

    if (activeRole === 'producer') {
      return (
        <div className="space-y-4">
          <form onSubmit={handleCreateBatch} className="space-y-3 rounded-lg border bg-white p-4">
            <h4 className="font-semibold text-gray-900">Harvest + Bind Hardware</h4>
            <div className="space-y-2">
              <Label htmlFor="producer-hardware-id">Hardware ID</Label>
              <Input
                id="producer-hardware-id"
                value={hardwareIdInput}
                onChange={(event) => setHardwareIdInput(event.target.value)}
                placeholder="e.g., A1B2C3D4E5F6"
                disabled={harvestSubmitting}
              />
            </div>
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
              <Label htmlFor="producer-weight">Weight (kg)</Label>
              <Input
                id="producer-weight"
                type="number"
                value={weightInput}
                onChange={(event) => setWeightInput(event.target.value)}
                placeholder="e.g., 100"
                min={1}
                disabled={harvestSubmitting}
              />
            </div>
            {renderTxFeedback(harvestFeedback)}
            {harvestSubmitting ? renderWalletConnectHint(harvestPendingConnector) : null}
            <Button className="w-full" disabled={harvestSubmitting || !hardwareIdInput.trim()}>
              <Package className="mr-2 h-4 w-4" />
              {harvestSubmitting ? 'Submitting...' : 'Harvest & Bind Hardware'}
            </Button>
          </form>
          {activeBatchId ? (
            renderTransferForm('producer')
          ) : (
            <p className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
              This scan is currently unmapped. Complete harvest to bind this hardware id to a batch, then transfer actions
              will be enabled.
            </p>
          )}
        </div>
      );
    }

    if (activeRole === 'transporter') {
      if (!activeBatchId) {
        return (
          <p className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
            This hardware id is not mapped to a batch yet. A producer must harvest and bind it before transporter actions
            are available.
          </p>
        );
      }
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          {renderReceiveForm('transporter', 'Receive Shipment')}
          {renderTransferForm('transporter', 'Deliver Shipment')}
        </div>
      );
    }

    if (activeRole === 'warehouse' || activeRole === 'processor') {
      if (!activeBatchId) {
        return (
          <p className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
            This hardware id is not mapped to a batch yet. A producer must harvest and bind it before chain actions are
            available.
          </p>
        );
      }
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          {renderReceiveForm(activeRole)}
          {renderTransferForm(activeRole)}
        </div>
      );
    }

    if (!activeBatchId) {
      return (
        <p className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
          This hardware id is not mapped to a batch yet. A producer must harvest and bind it before customer verification
          or receive actions can proceed.
        </p>
      );
    }

    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={handleVerify} className="space-y-3 rounded-lg border bg-white p-4">
          <h4 className="font-semibold text-gray-900">Verify Batch</h4>
          <div className="space-y-2">
            <Label htmlFor="customer-verify-lookup">Batch ID</Label>
            <Input
              id="customer-verify-lookup"
              type="number"
              min={1}
              value={verifyLookup}
              onChange={(event) => setVerifyLookup(event.target.value)}
              placeholder="e.g., 12"
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

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-16 text-center sm:px-6 lg:px-8">
          <h1 className="text-xl font-semibold text-gray-900">Sign in required</h1>
          <p className="text-sm text-gray-600">
            Batch Actions are only available to signed-in wallets. Redirecting to the dashboard...
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Batch Action Console</CardTitle>
            <CardDescription>
              This page consumes signed NFC deep-link context from native phone scans and enables role-gated actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={scanSnapshot ? 'success' : 'outline'}>
                {scanSnapshot ? 'Signed payload loaded' : 'No scan context'}
              </Badge>
              <Badge variant={isConnected ? 'secondary' : 'warning'}>
                {isConnected ? `Role: ${roleLabel}` : 'Wallet disconnected'}
              </Badge>
              <Badge variant={activeBatchId ? 'success' : 'outline'}>
                {activeBatchId ? `Resolved batch: ${activeBatchId}` : 'Unmapped hardware'}
              </Badge>
            </div>

            {scanSnapshot ? (
              <div className="rounded-md border bg-green-50 p-3 text-xs text-green-900">
                <p className="font-semibold">Current scan context</p>
                <p className="mt-1">Hardware ID: {scanSnapshot.hardwareId}</p>
                <p>Batch ID: {scanSnapshot.resolvedBatchId ?? 'Not mapped yet'}</p>
                <p>Mapping status: {scanSnapshot.mappingStatus}</p>
                <p>Temp max: {scanSnapshot.tempMax.toFixed(2)} C</p>
                <p>Humidity max: {scanSnapshot.humiMax.toFixed(2)} %</p>
                <p>Flag: {scanSnapshot.flag}</p>
                <p>Verified: {scanAgeLabel}</p>
                {scanSnapshot.version === 2 ? (
                  <p>
                    Counters: boot={scanSnapshot.bootId}, nfc_seq={scanSnapshot.nfcSeq}, sample_seq={scanSnapshot.sampleSeq}
                  </p>
                ) : (
                  <p>Legacy ts: {scanSnapshot.ts}</p>
                )}
                <p>Replay status: {scanSnapshot.replayStatus}</p>
                <p className="break-all">Signature: {scanSnapshot.sig}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-700">
                No pending NFC context is available. Scan a hardware tag with the native phone scanner to open `/nfc`.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">{renderRoleActions()}</CardContent>
        </Card>
      </main>
    </div>
  );
}
