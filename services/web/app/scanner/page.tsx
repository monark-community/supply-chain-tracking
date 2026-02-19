'use client';

import { useState } from 'react';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { QrCode, Scan, Clock, Package, CheckCircle } from 'lucide-react';
import { readBatchByTrackingOrId } from '@/lib/chainproof-read';

type JourneyEvent = {
  type: string;
  text: string;
  timestamp: number;
  txHash: string;
};

type ScannedData = {
  chainId: number;
  contractAddress: string;
  batchNumber: string | number;
  productName: string;
  status: string;
  quantity: number;
  currentHandler: string;
  createdAt: number;
  updatedAt: number;
  parents: number[];
  children: number[];
  journey: JourneyEvent[];
};

export default function ScannerPage() {
  const [batchNumber, setBatchNumber] = useState('');
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await readBatchByTrackingOrId(batchNumber);
      const statusLabel = result.batch.status === 0 ? 'active' : 'consumed';
      setScannedData({
        chainId: result.chainId,
        contractAddress: result.contractAddress,
        batchNumber: result.batch.trackingCode || result.batch.id,
        productName: result.batch.origin,
        status: statusLabel,
        quantity: result.batch.quantity,
        currentHandler: result.batch.currentHandler,
        createdAt: result.batch.createdAt,
        updatedAt: result.batch.updatedAt,
        parents: result.parents,
        children: result.children,
        journey: result.timeline,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Batch lookup failed';
      setError(message);
      setScannedData(null);
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      HARVEST: 'bg-green-100 text-green-800',
      SPLIT: 'bg-purple-100 text-purple-800',
      MERGE: 'bg-indigo-100 text-indigo-800',
      TRANSFORM: 'bg-yellow-100 text-yellow-800',
      TRANSFER: 'bg-blue-100 text-blue-800',
      RECEIVE: 'bg-orange-100 text-orange-800',
    };
    return colors[action] || 'bg-gray-100 text-gray-800';
  };

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">QR Code Scanner</h1>
          <p className="mt-2 text-gray-600">Scan product QR codes to view their complete supply chain journey</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Scan QR Code</CardTitle>
              <CardDescription>Enter batch number or scan QR code</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
                <div className="text-center">
                  <QrCode className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-600">QR Scanner Placeholder</p>
                  <p className="text-xs text-gray-500">Camera access required</p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-gray-500">Or enter manually</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="batch">Batch Number</Label>
                <Input
                  id="batch"
                  placeholder="Enter tracking code or numeric batch id"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                />
              </div>

              <Button className="w-full" onClick={handleScan} disabled={loading || !batchNumber.trim()}>
                <Scan className="mr-2 h-4 w-4" />
                {loading ? 'Looking up...' : 'Look Up Batch'}
              </Button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            {scannedData ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>Product Information</CardTitle>
                        <p className="mt-1 text-sm text-gray-500">{scannedData.batchNumber}</p>
                      </div>
                      <Badge className={getActionColor(scannedData.status)}>
                        {scannedData.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm text-gray-500">Origin / Product Label</p>
                        <p className="mt-1 font-medium text-gray-900">{scannedData.productName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Current Handler</p>
                        <p className="mt-1 font-medium text-gray-900">{scannedData.currentHandler}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Parents</p>
                        <p className="mt-1 font-medium text-gray-900">
                          {scannedData.parents.length ? scannedData.parents.join(', ') : 'None'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Children</p>
                        <p className="mt-1 font-medium text-gray-900">
                          {scannedData.children.length ? scannedData.children.join(', ') : 'None'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Quantity</p>
                        <p className="mt-1 font-medium text-gray-900">{scannedData.quantity.toLocaleString()} units</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Network / Contract</p>
                        <p className="mt-1 font-medium text-gray-900">
                          Chain {scannedData.chainId} • {scannedData.contractAddress}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Created</p>
                        <p className="mt-1 font-medium text-gray-900">{formatTimestamp(scannedData.createdAt)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Updated</p>
                        <p className="mt-1 font-medium text-gray-900">{formatTimestamp(scannedData.updatedAt)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Supply Chain Journey</CardTitle>
                    <CardDescription>Complete traceability from origin to current location</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="relative space-y-6">
                      <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gray-200"></div>
                      {scannedData.journey.map((event, index) => (
                        <div key={`${event.txHash}-${index}`} className="relative flex gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-blue-600">
                            <CheckCircle className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1 space-y-2 pb-6">
                            <div className="flex items-center space-x-2">
                              <Badge className={getActionColor(event.type)}>{event.type}</Badge>
                              <Badge className="bg-green-100 text-green-800">On-chain</Badge>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{event.text}</p>
                              <div className="mt-1 flex items-center space-x-4 text-sm text-gray-600">
                                <span className="flex items-center">
                                  <Clock className="mr-1 h-3 w-3" />
                                  {formatTimestamp(event.timestamp)}
                                </span>
                                <span className="truncate max-w-[260px]">tx: {event.txHash}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {!scannedData.journey.length && (
                        <div className="relative flex gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-gray-500">
                            <Clock className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1 space-y-2 pb-2">
                            <p className="font-medium text-gray-900">No timeline events found for this batch.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="flex min-h-[400px] items-center justify-center">
                <div className="text-center">
                  <Package className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-lg font-medium text-gray-900">No Product Scanned</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Scan a QR code or enter a batch number to view product details
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
