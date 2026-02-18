'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Factory, Package, Activity, TrendingUp, QrCode, ArrowRightLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ProcessorDashboard() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Processor Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Receive shipments, perform processing operations, and manage custody transfers
        </p>
      </div>

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
            Use QR scanner to receive shipments, transfer custody, and log events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/scanner">
              <Button className="w-full h-20 flex-col" size="lg">
                <Package className="h-6 w-6 mb-1" />
                <span className="font-semibold">Receive Shipment</span>
                <span className="text-xs opacity-90">Take custody</span>
              </Button>
            </Link>
            <Link href="/scanner">
              <Button className="w-full h-20 flex-col" variant="outline" size="lg">
                <ArrowRightLeft className="h-6 w-6 mb-1" />
                <span className="font-semibold">Transfer Shipment</span>
                <span className="text-xs opacity-90">Pass to the receiving location</span>
              </Button>
            </Link>
            <Link href="/scanner">
              <Button className="w-full h-20 flex-col" variant="outline" size="lg">
                <Activity className="h-6 w-6 mb-1" />
                <span className="font-semibold">Log Event</span>
                <span className="text-xs opacity-90">Record processing</span>
              </Button>
            </Link>
          </div>
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
          <CardTitle>Event Types You Can Log</CardTitle>
          <CardDescription>Processing operations available to processors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h4 className="font-semibold text-gray-900 mb-2">Processing Actions</h4>
              <ul className="space-y-1 text-sm text-gray-700">
                <li>• Cleaning operations</li>
                <li>• Sorting and grading</li>
                <li>• Packaging and labeling</li>
                <li>• Storage and handling</li>
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-semibold text-gray-900 mb-2">Quality Checks</h4>
              <ul className="space-y-1 text-sm text-gray-700">
                <li>• Visual inspection</li>
                <li>• Temperature logging</li>
                <li>• Humidity monitoring</li>
                <li>• Condition assessment</li>
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
                <li>• Scan QR codes</li>
                <li>• Receive shipments (take custody)</li>
                <li>• Transfer shipments (pass custody)</li>
                <li>• Log processing events</li>
                <li>• Perform quality inspections</li>
                <li>• View shipment history</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-red-700 mb-2 flex items-center">
                <span className="mr-2">❌</span> You Cannot
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Create products</li>
                <li>• Create batches</li>
                <li>• Initiate supply chain</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
