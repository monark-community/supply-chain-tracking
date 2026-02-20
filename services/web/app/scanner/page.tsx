'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Nav } from '@/components/nav';
import { useWalletAuth } from '@/components/auth/wallet-auth-provider';
import { useNfcBleBridge } from '@/hooks/useNfcBleBridge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowRightLeft, Bluetooth, CheckCircle, Package, Search } from 'lucide-react';
import { initiateBatchTransfer, receiveTransferredBatch } from '@/lib/chainproof-write';
import { readBatchByTrackingOrId } from '@/lib/chainproof-read';
import type { AppRole } from '@/lib/wallet-auth';

type TxFeedback = {
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
    blePhase,
    lastSuccessfulBlePhase,
    lastBleErrorName,
    lastBleErrorMessage,
    connectNfcDevice,
    disconnectNfcDevice,
  } = useNfcBleBridge();

  const [transferLookup, setTransferLookup] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<TxFeedback | null>(null);

  const [receiveLookup, setReceiveLookup] = useState('');
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveFeedback, setReceiveFeedback] = useState<TxFeedback | null>(null);

  const [verifyLookup, setVerifyLookup] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<TxFeedback | null>(null);

  const activeRole: AppRole = isConnected ? role : 'none';

  const handleTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTransferSubmitting(true);
    setTransferFeedback(null);

    try {
      const result = await initiateBatchTransfer({
        lookup: transferLookup,
        to: transferRecipient,
      });
      setTransferFeedback({
        type: 'success',
        message: `Transfer initiated for batch ${result.batchId}.`,
        txHash: result.txHash,
      });
      setTransferLookup('');
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
      const result = await receiveTransferredBatch({
        lookup: receiveLookup,
      });
      setReceiveFeedback({
        type: 'success',
        message: `Batch ${result.batchId} received successfully.`,
        txHash: result.txHash,
      });
      setReceiveLookup('');
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
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-transfer-lookup`}>Batch ID or tracking code</Label>
        <Input
          id={`${prefix}-transfer-lookup`}
          value={transferLookup}
          onChange={(event) => setTransferLookup(event.target.value)}
          placeholder="e.g., 12 or BATCH-2026-001"
          disabled={transferSubmitting}
        />
      </div>
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
      <Button className="w-full" disabled={transferSubmitting || !transferLookup.trim() || !transferRecipient.trim()}>
        <ArrowRightLeft className="mr-2 h-4 w-4" />
        {transferSubmitting ? 'Submitting...' : 'Initiate Transfer'}
      </Button>
    </form>
  );

  const renderReceiveForm = (prefix: string, title = 'Receive Batch') => (
    <form onSubmit={handleReceive} className="space-y-3 rounded-lg border bg-white p-4">
      <h4 className="font-semibold text-gray-900">{title}</h4>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-receive-lookup`}>Batch ID or tracking code</Label>
        <Input
          id={`${prefix}-receive-lookup`}
          value={receiveLookup}
          onChange={(event) => setReceiveLookup(event.target.value)}
          placeholder="e.g., 12 or BATCH-2026-001"
          disabled={receiveSubmitting}
        />
      </div>
      {renderTxFeedback(receiveFeedback)}
      <Button className="w-full" disabled={receiveSubmitting || !receiveLookup.trim()}>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/batches?action=harvest">
              <Button className="w-full">Create New Batch</Button>
            </Link>
            <Button variant="outline" className="w-full" disabled>
              Log Event (next)
            </Button>
          </div>
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
              Actions are always visible during testing. Later we can gate this section behind NFC device connection.
            </CardDescription>
          </CardHeader>
          <CardContent>{renderRoleActions()}</CardContent>
        </Card>
      </main>
    </div>
  );
}
