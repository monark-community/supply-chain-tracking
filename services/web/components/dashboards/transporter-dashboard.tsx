'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, MapPin, Activity, Clock, QrCode, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReadOnlyChainCard } from './read-only-chain-card';

export function TransporterDashboard() {
  const stats = [
    { name: 'Active Shipments', value: '15', icon: Truck, change: '3 in transit' },
    { name: 'Delivered Today', value: '8', icon: MapPin, change: 'On schedule' },
    { name: 'Total Distance', value: '12,450 km', icon: Activity, change: 'This month' },
    { name: 'Avg Delivery Time', value: '4.2 days', icon: Clock, change: '-0.5 days improved' },
  ];

  const activeShipments = [
    { batch: 'BATCH-X1Y2', product: 'Coffee Beans', from: 'Green Valley Farms', to: 'Central Processor', status: 'In Transit', eta: '2 hours' },
    { batch: 'BATCH-Z3W4', product: 'Tea Leaves', from: 'Mountain Tea Co.', to: 'Processing Plant', status: 'Loaded', eta: '6 hours' },
    { batch: 'BATCH-A5B6', product: 'Cocoa', from: 'Ethical Cocoa Ltd.', to: 'Chocolate Factory', status: 'In Transit', eta: '1 day' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Transporter Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Move shipments between facilities and maintain custody continuity
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
            <QrCode className="mr-2 h-5 w-5" />
            QR Scanner Operations
          </CardTitle>
          <CardDescription className="text-blue-700">
            Scan QR codes to receive shipments and deliver to the next handoff point
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/scanner">
              <Button className="w-full h-24 flex-col" size="lg">
                <Truck className="h-8 w-8 mb-2" />
                <span className="font-semibold text-base">Receive Shipment</span>
                <span className="text-xs opacity-90">Accept custody when picking up goods</span>
              </Button>
            </Link>
            <Link href="/scanner">
              <Button className="w-full h-24 flex-col" variant="outline" size="lg">
                <MapPin className="h-8 w-8 mb-2" />
                <span className="font-semibold text-base">Deliver Shipment</span>
                <span className="text-xs opacity-90">Transfer custody to receiving location</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>View Shipment</CardTitle>
            <CardDescription>Inspect shipment details before transport</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              Before transporting, you can view shipment information:
            </p>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <Eye className="mr-2 h-4 w-4 text-blue-600 mt-0.5" />
                Inspect shipment status
              </li>
              <li className="flex items-start">
                <Eye className="mr-2 h-4 w-4 text-blue-600 mt-0.5" />
                Verify origin and destination
              </li>
              <li className="flex items-start">
                <Eye className="mr-2 h-4 w-4 text-blue-600 mt-0.5" />
                Review previous custody chain
              </li>
              <li className="flex items-start">
                <Eye className="mr-2 h-4 w-4 text-blue-600 mt-0.5" />
                Check product details and quantity
              </li>
            </ul>
            <Link href="/scanner">
              <Button variant="outline" className="w-full mt-4">
                <QrCode className="mr-2 h-4 w-4" />
                Scan to View Shipment
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Shipments</CardTitle>
            <CardDescription>Currently in your custody</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeShipments.map((item) => (
                <div key={item.batch} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.product}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.batch}</p>
                      <p className="text-sm text-gray-600 mt-2">
                        {item.from} → {item.to}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-gray-500">ETA: {item.eta}</p>
                    <Button size="sm" variant="link" className="h-auto p-0 text-xs">
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transport Process</CardTitle>
          <CardDescription>How custody transfer works</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white font-bold mb-3">
                1
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Receive Shipment</h4>
              <p className="text-sm text-gray-700">
                Scan QR at pickup location to accept custody and record transfer event
              </p>
            </div>
            <div className="rounded-lg border-2 border-gray-200 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-600 text-white font-bold mb-3">
                2
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Transport Goods</h4>
              <p className="text-sm text-gray-700">
                Maintain custody during transport with optional location updates
              </p>
            </div>
            <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white font-bold mb-3">
                3
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Deliver Shipment</h4>
              <p className="text-sm text-gray-700">
                Scan QR at delivery to transfer custody to the receiving location
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transporter Permissions</CardTitle>
          <CardDescription>What you can and cannot do</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-semibold text-green-700 mb-2 flex items-center">
                <span className="mr-2">✅</span> You Can
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Scan QR codes</li>
                <li>• Receive shipments (pickup)</li>
                <li>• Deliver shipments (drop-off)</li>
                <li>• View shipment details</li>
                <li>• Track custody transfers</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-red-700 mb-2 flex items-center">
                <span className="mr-2">❌</span> You Cannot
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Create products or batches</li>
                <li>• Log processing events</li>
                <li>• Perform quality inspections</li>
                <li>• Modify product data</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
