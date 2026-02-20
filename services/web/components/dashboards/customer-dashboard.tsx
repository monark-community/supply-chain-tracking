'use client';

import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Shield, Search, Eye, Bluetooth } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReadOnlyChainCard } from './read-only-chain-card';
import { receiveTransferredBatchById } from '@/lib/chainproof-write';
import { useNfcBleBridge } from '@/hooks/useNfcBleBridge';

type TxFeedback = {
  type: 'success' | 'error';
  message: string;
  txHash?: string;
};

export function CustomerDashboard() {
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveFeedback, setReceiveFeedback] = useState<TxFeedback | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [loadingHardwareBatch, setLoadingHardwareBatch] = useState(false);
  const { isNfcConnected, isConnecting, nfcDeviceName, connectionError, connectNfcDevice, readActiveBatchIdFromHardware } =
    useNfcBleBridge();

  const recentVerifications = [
    { product: 'Organic Coffee Beans', batch: 'BATCH-A1B2C3', verified: true, time: '5 min ago', origin: 'Green Valley Farms' },
    { product: 'Fair Trade Cocoa', batch: 'BATCH-D4E5F6', verified: true, time: '1 hour ago', origin: 'Ethical Cocoa Co.' },
    { product: 'Premium Tea Leaves', batch: 'BATCH-G7H8I9', verified: true, time: '3 hours ago', origin: 'Mountain Tea Estates' },
  ];

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
        <h1 className="text-3xl font-bold text-gray-900">Customer Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Verify product authenticity and view complete supply chain traceability
        </p>
      </div>

      <ReadOnlyChainCard />

      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center text-blue-900">
            <Shield className="mr-2 h-5 w-5" />
            Customer Access
          </CardTitle>
          <CardDescription className="text-blue-700">
            Customers can verify product history and receive batches that are explicitly transferred to them
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-2 border-gray-200">
          <CardHeader>
            <CardTitle>Verify Product</CardTitle>
            <CardDescription>Search by batch ID or tracking code</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="h-16 w-full justify-start" variant="outline" size="lg">
              <Search className="mr-3 h-6 w-6" />
              <div className="text-left">
                <div className="font-semibold">Search by Batch ID</div>
                <div className="text-xs opacity-90">Use a tracking code or numeric batch ID</div>
              </div>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What You Can View</CardTitle>
            <CardDescription>Information available to customers</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start">
                <Eye className="mr-2 mt-0.5 h-4 w-4 text-green-600" />
                <span className="text-gray-700">Full shipment journey and custody transfers</span>
              </li>
              <li className="flex items-start">
                <Eye className="mr-2 mt-0.5 h-4 w-4 text-green-600" />
                <span className="text-gray-700">Environmental data (temperature, humidity)</span>
              </li>
              <li className="flex items-start">
                <Eye className="mr-2 mt-0.5 h-4 w-4 text-green-600" />
                <span className="text-gray-700">Verification status and authenticity</span>
              </li>
              <li className="flex items-start">
                <Eye className="mr-2 mt-0.5 h-4 w-4 text-green-600" />
                <span className="text-gray-700">Product origin and handling history</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 border-blue-200">
        <CardHeader>
          <CardTitle>Receive Transfer</CardTitle>
          <CardDescription>Accept custody for a batch transferred to your customer wallet</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReceive} className="space-y-3 rounded-lg border bg-white p-4">
            <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">Hardware required</p>
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
                  disabled={!isNfcConnected || loadingHardwareBatch || receiveSubmitting}
                >
                  {loadingHardwareBatch ? 'Reading...' : 'Load Batch From Hardware'}
                </Button>
              </div>
            </div>
            {receiveFeedback && (
              <p className={`text-sm ${receiveFeedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
                {receiveFeedback.message}
                {receiveFeedback.txHash ? ` tx: ${receiveFeedback.txHash}` : ''}
              </p>
            )}
            <Button className="w-full" disabled={receiveSubmitting || !isNfcConnected || !activeBatchId}>
              {receiveSubmitting ? 'Submitting...' : 'Receive Batch'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Verifications</CardTitle>
          <CardDescription>Batches you have recently looked up</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentVerifications.map((item, i) => (
              <div key={i} className="flex items-start justify-between border-b pb-4 last:border-0">
                <div className="flex items-start space-x-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                    <Package className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{item.product}</p>
                    <p className="mt-0.5 text-xs text-gray-500">Batch: {item.batch}</p>
                    <p className="mt-1 text-xs text-gray-600">Origin: {item.origin}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                    <Shield className="mr-1 h-3 w-3" />
                    Verified
                  </span>
                  <p className="mt-1 text-xs text-gray-500">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer Permissions</CardTitle>
          <CardDescription>What you can and cannot do</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 flex items-center font-semibold text-green-700">
                <span className="mr-2">✅</span> You Can
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Look up batches by ID or tracking code</li>
                <li>• View shipment journey</li>
                <li>• Verify authenticity</li>
                <li>• Check environmental data</li>
                <li>• See custody history</li>
                <li>• Receive transferred batches</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-2 flex items-center font-semibold text-red-700">
                <span className="mr-2">❌</span> You Cannot
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Create root batches</li>
                <li>• Create batches</li>
                <li>• Initiate transfers to others</li>
                <li>• Log events</li>
                <li>• Modify any data</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
