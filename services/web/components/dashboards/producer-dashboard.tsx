'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TrendingUp, MapPin, Activity, ArrowRightLeft, QrCode, Bluetooth } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReadOnlyChainCard } from './read-only-chain-card';
import { initiateBatchTransferById } from '@/lib/chainproof-write';
import { useNfcBleBridge } from '@/hooks/useNfcBleBridge';

type TxFeedback = {
  type: 'success' | 'error';
  message: string;
  txHash?: string;
};

export function ProducerDashboard() {
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<TxFeedback | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [loadingHardwareBatch, setLoadingHardwareBatch] = useState(false);
  const { isNfcConnected, isConnecting, nfcDeviceName, connectionError, connectNfcDevice, readActiveBatchIdFromHardware } =
    useNfcBleBridge();

  const stats = [
    { name: 'Batches Created', value: '12', icon: Package, change: '+2 this week' },
    { name: 'Active Batches', value: '8', icon: MapPin, change: '3 in production' },
    { name: 'Total Output', value: '2,450 kg', icon: TrendingUp, change: '+15% vs last month' },
    { name: 'Batches Shipped', value: '24', icon: Activity, change: 'All tracked' },
  ];

  const recentBatches = [
    { batch: 'BATCH-001', product: 'Organic Coffee Beans', qty: '500 kg', status: 'Ready to Ship', date: '2 hours ago' },
    { batch: 'BATCH-002', product: 'Premium Tea Leaves', qty: '300 kg', status: 'In Transit', date: '1 day ago' },
    { batch: 'BATCH-003', product: 'Cocoa Beans', qty: '750 kg', status: 'In Production', date: '3 days ago' },
  ];

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
      if (!batchId) {
        throw new Error('No active batch id was found on connected hardware.');
      }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Producer Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Manage batches and initiate supply chain tracking
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

      <Card>
        <CardHeader>
          <CardTitle>Batch Management</CardTitle>
          <CardDescription>Create batches and start shipment tracking</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Link href="/batches?action=harvest">
              <Button className="w-full">
                <MapPin className="mr-2 h-4 w-4" />
                Create New Batch
              </Button>
            </Link>
            <Link href="/scanner">
              <Button variant="outline" className="w-full">
                <QrCode className="mr-2 h-4 w-4" />
                Open NFC Console
              </Button>
            </Link>
            <Button variant="outline" className="w-full">
              <Activity className="mr-2 h-4 w-4" />
              Log Event
            </Button>
          </div>

          <form onSubmit={handleTransfer} className="space-y-3 rounded-lg border bg-white p-4">
            <h4 className="font-semibold text-gray-900">Initiate Transfer</h4>
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
                  disabled={!isNfcConnected || loadingHardwareBatch || transferSubmitting}
                >
                  {loadingHardwareBatch ? 'Reading...' : 'Load Batch From Hardware'}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="producer-transfer-recipient">Recipient wallet</Label>
              <Input
                id="producer-transfer-recipient"
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

          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Recent Batches</h4>
            {recentBatches.map((item) => (
              <div key={item.batch} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{item.product}</p>
                  <p className="text-xs text-gray-500">{item.batch} • {item.qty}</p>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                    {item.status}
                  </span>
                  <p className="mt-1 text-xs text-gray-500">{item.date}</p>
                  <Button size="sm" variant="link" className="h-auto p-0 text-xs">
                    View Journey
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Producer Permissions</CardTitle>
          <CardDescription>What you can and cannot do</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-semibold text-green-700 mb-2 flex items-center">
                <span className="mr-2">✅</span> You Can
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Create production batches</li>
                <li>• Initiate transfers to transporter, warehouse, or processor</li>
                <li>• Log batch events (production, packaging)</li>
                <li>• View batch journey and traceability</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-red-700 mb-2 flex items-center">
                <span className="mr-2">❌</span> You Cannot
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Receive shipments from others</li>
                <li>• Log processing events</li>
                <li>• Perform quality inspections</li>
                <li>• Deliver to final destination</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
