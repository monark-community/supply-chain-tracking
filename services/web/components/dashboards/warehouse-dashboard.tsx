'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReadOnlyChainCard } from './read-only-chain-card';
import { Archive, Package, ArrowRightLeft, QrCode, Boxes, TrendingUp } from 'lucide-react';

export function WarehouseDashboard() {
  const stats = [
    { name: 'Batches in Storage', value: '21', icon: Archive, change: '4 staged for dispatch' },
    { name: 'Received Today', value: '9', icon: Package, change: '2 pending inspection' },
    { name: 'Merged Batches', value: '17', icon: Boxes, change: '+3 this week' },
    { name: 'On-Time Handovers', value: '97.1%', icon: TrendingUp, change: 'Stable performance' },
  ];

  const activeQueue = [
    { batch: 'BATCH-W1A2', product: 'Processed Coffee Blend', qty: '350 kg', status: 'Received', time: '45 min ago' },
    { batch: 'BATCH-W3B4', product: 'Refined Cocoa Mix', qty: '620 kg', status: 'Ready to Merge', time: '3 hours ago' },
    { batch: 'BATCH-W5C6', product: 'Tea Consolidation Lot', qty: '410 kg', status: 'Awaiting Transfer', time: '6 hours ago' },
  ];

  const statusColors: Record<string, string> = {
    'Received': 'bg-blue-100 text-blue-800',
    'Ready to Merge': 'bg-purple-100 text-purple-800',
    'Awaiting Transfer': 'bg-green-100 text-green-800',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Warehouse Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Receive, split, merge, and transfer batches while preserving custody and lineage
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
            Warehouse Actions
          </CardTitle>
          <CardDescription className="text-blue-700">
            Receive custody, split and merge lots, and hand off to transport
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/scanner">
              <Button className="w-full h-20 flex-col" size="lg">
                <Package className="h-6 w-6 mb-1" />
                <span className="font-semibold">Receive Batch</span>
                <span className="text-xs opacity-90">Take custody</span>
              </Button>
            </Link>
            <Link href="/scanner">
              <Button className="w-full h-20 flex-col" variant="outline" size="lg">
                <Boxes className="h-6 w-6 mb-1" />
                <span className="font-semibold">Split / Merge</span>
                <span className="text-xs opacity-90">Manage lots</span>
              </Button>
            </Link>
            <Link href="/scanner">
              <Button className="w-full h-20 flex-col" variant="outline" size="lg">
                <ArrowRightLeft className="h-6 w-6 mb-1" />
                <span className="font-semibold">Transfer Batch</span>
                <span className="text-xs opacity-90">Handover next</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage Queue</CardTitle>
          <CardDescription>Batches currently managed at your facility</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activeQueue.map((item) => (
              <div key={item.batch} className="flex items-start justify-between rounded-lg border p-3">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{item.product}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.batch} • {item.qty}</p>
                  <p className="text-xs text-gray-400 mt-1">{item.time}</p>
                </div>
                <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${statusColors[item.status]}`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Warehouse Permissions</CardTitle>
          <CardDescription>What you can and cannot do</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-semibold text-green-700 mb-2 flex items-center">
                <span className="mr-2">✅</span> You Can
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Receive batches into custody</li>
                <li>• Split batches into child batches</li>
                <li>• Merge multiple batches into one</li>
                <li>• Transfer custody to next participant</li>
                <li>• View full lineage and custody history</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-red-700 mb-2 flex items-center">
                <span className="mr-2">❌</span> You Cannot
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>• Harvest new root batches</li>
                <li>• Transform batches into new processed form</li>
                <li>• Assign roles to other accounts</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
