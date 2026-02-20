'use client';

import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Factory, Package, Activity, TrendingUp, ArrowRightLeft, CheckCircle, Bluetooth } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReadOnlyChainCard } from './read-only-chain-card';
import { initiateBatchTransferById, receiveTransferredBatchById } from '@/lib/chainproof-write';
import { useNfcBleBridge } from '@/hooks/useNfcBleBridge';

type TxFeedback = {
  type: 'success' | 'error';
  message: string;
  txHash?: string;
};

export function ProcessorDashboard() {
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<TxFeedback | null>(null);
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveFeedback, setReceiveFeedback] = useState<TxFeedback | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [loadingHardwareBatch, setLoadingHardwareBatch] = useState(false);
  const { isNfcConnected, isConnecting, nfcDeviceName, connectionError, connectNfcDevice, readActiveBatchIdFromHardware } =
    useNfcBleBridge();

  const stats = [
    { name: 'Batches in Processing', value: '9', icon: Factory, change: '4 waiting' },
    { name: 'Received Today', value: '6', icon: Package, change: 'On schedule' },
    { name: 'Processed This Month', value: '142', icon: Activity, change: '+12% vs last' },
    { name: 'Quality Pass Rate', value: '98.5%', icon: TrendingUp, change: 'Excellent' },
  ];

  const processingQueue = [
    { batch: 'BATCH-A1B2', product: 'Organic Coffee Beans', qty: '500 kg', status: 'Received', time: '2 hours ago' },
    { batch: 'BATCH-C3D4', product: 'Premium Tea Leaves', qty: '300 kg', status: 'In Process', time: '5 hours ago' },
    { batch: 'BATCH-E5F6', product: 'Fair Trade Cocoa', qty: '750 kg', status: 'Quality Check', time: '1 day ago' },
  ];

  const statusColors: Record<string, string> = {
    'Received': 'bg-blue-100 text-blue-800',
    'In Process': 'bg-yellow-100 text-yellow-800',
    'Quality Check': 'bg-purple-100 text-purple-800',
    'Ready to Ship': 'bg-green-100 text-green-800',
  };

  const handleTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTransferSubmitting(true);
    setTransferFeedback(null);
    try {
      let batchId = activeBatchId;
      if (!batchId) {
        setLoadingHardwareBatch(true);
        try {
          batchId = await readActiveBatchIdFromHardware();
        } finally {
          setLoadingHardwareBatch(false);
        }
      }
      if (!batchId) throw new Error('No active batch id was found on connected hardware.');
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
    } catch (error) {
      setTransferFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Transfer initiation failed.',
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
        setLoadingHardwareBatch(true);
        try {
          batchId = await readActiveBatchIdFromHardware();
        } finally {
          setLoadingHardwareBatch(false);
        }
      }
      if (!batchId) throw new Error('No active batch id was found on connected hardware.');
      setActiveBatchId(batchId);
      const result = await receiveTransferredBatchById({ batchId });
      setReceiveFeedback({
        type: 'success',
        message: `Batch ${result.batchId} received successfully.`,
        txHash: result.txHash,
      });
    } catch (error) {
      setReceiveFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Receive transaction failed.',
      });
    } finally {
      setReceiveSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Processor Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Receive, split, merge, and transform batches while preserving full lineage
        </p>
      </div>

      <ReadOnlyChainCard />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.name}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{stat.name}</CardTitle>
                <Icon className="h-4 w-4 text-gray-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                <p className="mt-1 text-xs text-gray-600">{stat.change}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center text-blue-900">
            <ArrowRightLeft className="mr-2 h-5 w-5" />
            Custody Operations
          </CardTitle>
          <CardDescription className="text-blue-700">
            Transfer custody to the next participant and receive incoming batches
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border bg-white p-3 text-xs text-slate-700 lg:col-span-2">
            <p className="font-semibold text-slate-900">Hardware required for custody actions</p>
            <p className="mt-1">{isNfcConnected ? `Connected: ${nfcDeviceName || 'ESP32 device'}` : 'Not connected'}</p>
            <p className="mt-1">Active batch ID: {activeBatchId ?? 'Not loaded'}</p>
            {connectionError ? <p className="mt-1 text-red-600">{connectionError}</p> : null}
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="outline" onClick={() => void connectNfcDevice()} disabled={isNfcConnected || isConnecting}>
                <Bluetooth className="mr-2 h-4 w-4" />
                {isConnecting ? 'Connecting...' : isNfcConnected ? 'Connected' : 'Connect'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void readActiveBatchIdFromHardware().then((id) => setActiveBatchId(id))}
                disabled={!isNfcConnected || loadingHardwareBatch || transferSubmitting || receiveSubmitting}
              >
                {loadingHardwareBatch ? 'Reading...' : 'Load Batch From Hardware'}
              </Button>
            </div>
          </div>
          <form onSubmit={handleTransfer} className="space-y-3 rounded-lg border bg-white p-4">
            <h4 className="font-semibold text-gray-900">Initiate Transfer</h4>
            <div className="space-y-2">
              <Label htmlFor="processor-transfer-recipient">Recipient wallet</Label>
              <Input
                id="processor-transfer-recipient"
                value={transferRecipient}
                onChange={(event) => setTransferRecipient(event.target.value)}
                placeholder="0x..."
                disabled={transferSubmitting}
              />
            </div>
            {transferFeedback && (
              <p className={`text-sm ${transferFeedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
                {transferFeedback.message}
                {transferFeedback.txHash ? ` tx: ${transferFeedback.txHash}` : ''}
              </p>
            )}
            <Button className="w-full" disabled={transferSubmitting || !isNfcConnected || !activeBatchId || !transferRecipient.trim()}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              {transferSubmitting ? 'Submitting...' : 'Initiate Transfer'}
            </Button>
          </form>

          <form onSubmit={handleReceive} className="space-y-3 rounded-lg border bg-white p-4">
            <h4 className="font-semibold text-gray-900">Receive Batch</h4>
            {receiveFeedback && (
              <p className={`text-sm ${receiveFeedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
                {receiveFeedback.message}
                {receiveFeedback.txHash ? ` tx: ${receiveFeedback.txHash}` : ''}
              </p>
            )}
            <Button className="w-full" disabled={receiveSubmitting || !isNfcConnected || !activeBatchId}>
              <Package className="mr-2 h-4 w-4" />
              {receiveSubmitting ? 'Submitting...' : 'Receive Batch'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>View Shipment History</CardTitle>
            <CardDescription>Inspect shipment status and custody chain</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              Before processing, you can view the full shipment history to:
            </p>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <CheckCircle className="mr-2 h-4 w-4 text-green-600 mt-0.5" />
                Inspect complete shipment journey
              </li>
              <li className="flex items-start">
                <CheckCircle className="mr-2 h-4 w-4 text-green-600 mt-0.5" />
                Validate previous custody chain
              </li>
              <li className="flex items-start">
                <CheckCircle className="mr-2 h-4 w-4 text-green-600 mt-0.5" />
                Check shipment state and conditions
              </li>
              <li className="flex items-start">
                <CheckCircle className="mr-2 h-4 w-4 text-green-600 mt-0.5" />
                Verify temperature and quality data
              </li>
            </ul>
            <p className="pt-2 text-xs text-gray-500">
              Use the batch ID or tracking code lookup fields above to inspect shipment details.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Processing Queue</CardTitle>
            <CardDescription>Batches currently in your facility</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {processingQueue.map((item) => (
                <div key={item.batch} className="flex items-start justify-between rounded-lg border p-3">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{item.product}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.batch} • {item.qty}</p>
                    <p className="text-xs text-gray-400 mt-1">{item.time}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${statusColors[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Processing Operations</CardTitle>
          <CardDescription>Processor-only and shared operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h4 className="font-semibold text-gray-900 mb-2">Shared With Warehouse</h4>
              <ul className="space-y-1 text-sm text-gray-700">
                <li>• Receive custody</li>
                <li>• Transfer custody</li>
                <li>• Split batches</li>
                <li>• Merge batches</li>
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-semibold text-gray-900 mb-2">Processor-Only</h4>
              <ul className="space-y-1 text-sm text-gray-700">
                <li>• Transform one or more inputs</li>
                <li>• Create processed output batches</li>
                <li>• Link output to consumed inputs</li>
                <li>• Maintain process lineage records</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Processor Permissions</CardTitle>
          <CardDescription>What you can and cannot do</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-semibold text-green-700 mb-2 flex items-center">
                <span className="mr-2">✅</span> You Can
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Look up batches by ID or tracking code</li>
                <li>• Receive shipments (take custody)</li>
                <li>• Transfer shipments (pass custody)</li>
                <li>• Split and merge batches</li>
                <li>• Transform batches (processor only)</li>
                <li>• View shipment history</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-red-700 mb-2 flex items-center">
                <span className="mr-2">❌</span> You Cannot
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Create root batches</li>
                <li>• Harvest root batches</li>
                <li>• Assign participant roles</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
