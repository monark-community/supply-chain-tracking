'use client';

import { useState } from 'react';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { QrCode, Scan, MapPin, Clock, Package, CheckCircle } from 'lucide-react';

export default function ScannerPage() {
  const [batchNumber, setBatchNumber] = useState('');
  const [scannedData, setScannedData] = useState<any>(null);

  const handleScan = () => {
    setScannedData({
      batchNumber: 'BATCH-1K5A2-XYZ12',
      product: {
        name: 'Organic Coffee Beans',
        sku: 'COFFEE-ORG-001',
        category: 'Food & Beverage',
      },
      status: 'in_transit',
      quantity: 5000,
      currentLocation: 'Port of Rotterdam',
      journey: [
        {
          id: '1',
          action: 'produced',
          actor: 'Green Farm Co-op',
          location: 'Mumbai, India',
          timestamp: '2025-10-15 08:00',
          verified: true,
        },
        {
          id: '2',
          action: 'inspected',
          actor: 'Quality Control Corp.',
          location: 'Mumbai, India',
          timestamp: '2025-10-15 14:30',
          verified: true,
        },
        {
          id: '3',
          action: 'shipped',
          actor: 'Global Logistics Inc.',
          location: 'Mumbai Port',
          timestamp: '2025-10-16 06:00',
          verified: true,
        },
        {
          id: '4',
          action: 'in_transit',
          actor: 'Global Logistics Inc.',
          location: 'Port of Rotterdam',
          timestamp: '2025-10-17 10:00',
          verified: true,
        },
      ],
    });
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      produced: 'bg-green-100 text-green-800',
      shipped: 'bg-blue-100 text-blue-800',
      received: 'bg-orange-100 text-orange-800',
      inspected: 'bg-purple-100 text-purple-800',
      processed: 'bg-yellow-100 text-yellow-800',
      delivered: 'bg-emerald-100 text-emerald-800',
      in_transit: 'bg-blue-100 text-blue-800',
    };
    return colors[action] || 'bg-gray-100 text-gray-800';
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
                  placeholder="e.g., BATCH-1K5A2-XYZ12"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                />
              </div>

              <Button className="w-full" onClick={handleScan}>
                <Scan className="mr-2 h-4 w-4" />
                Look Up Batch
              </Button>
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
                        <p className="text-sm text-gray-500">Product Name</p>
                        <p className="mt-1 font-medium text-gray-900">{scannedData.product.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">SKU</p>
                        <p className="mt-1 font-medium text-gray-900">{scannedData.product.sku}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Category</p>
                        <p className="mt-1 font-medium text-gray-900">{scannedData.product.category}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Quantity</p>
                        <p className="mt-1 font-medium text-gray-900">
                          {scannedData.quantity.toLocaleString()} units
                        </p>
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
                      {scannedData.journey.map((event: any, index: number) => (
                        <div key={event.id} className="relative flex gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-blue-600">
                            {event.verified ? (
                              <CheckCircle className="h-6 w-6 text-white" />
                            ) : (
                              <Clock className="h-6 w-6 text-white" />
                            )}
                          </div>
                          <div className="flex-1 space-y-2 pb-6">
                            <div className="flex items-center space-x-2">
                              <Badge className={getActionColor(event.action)}>{event.action}</Badge>
                              {event.verified && (
                                <Badge variant="success" className="bg-green-100 text-green-800">
                                  Verified
                                </Badge>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{event.actor}</p>
                              <div className="mt-1 flex items-center space-x-4 text-sm text-gray-600">
                                <span className="flex items-center">
                                  <MapPin className="mr-1 h-3 w-3" />
                                  {event.location}
                                </span>
                                <span className="flex items-center">
                                  <Clock className="mr-1 h-3 w-3" />
                                  {event.timestamp}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
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
