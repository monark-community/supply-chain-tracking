'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TrendingUp, MapPin, Activity, QrCode, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReadOnlyChainCard } from './read-only-chain-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ProducerDashboard() {
  const stats = [
    { name: 'Products Registered', value: '12', icon: Package, change: '+2 this week' },
    { name: 'Active Batches', value: '8', icon: MapPin, change: '3 in production' },
    { name: 'Total Output', value: '2,450 kg', icon: TrendingUp, change: '+15% vs last month' },
    { name: 'Batches Shipped', value: '24', icon: Activity, change: 'All tracked' },
  ];

  const recentBatches = [
    { batch: 'BATCH-001', product: 'Organic Coffee Beans', qty: '500 kg', status: 'Ready to Ship', date: '2 hours ago' },
    { batch: 'BATCH-002', product: 'Premium Tea Leaves', qty: '300 kg', status: 'In Transit', date: '1 day ago' },
    { batch: 'BATCH-003', product: 'Cocoa Beans', qty: '750 kg', status: 'In Production', date: '3 days ago' },
  ];

  const products = [
    { name: 'Organic Coffee Beans', sku: 'COFFEE-001', category: 'Agricultural', batches: 5 },
    { name: 'Premium Tea Leaves', sku: 'TEA-002', category: 'Agricultural', batches: 3 },
    { name: 'Fair Trade Cocoa', sku: 'COCOA-003', category: 'Agricultural', batches: 4 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Producer Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Create products, manage batches, and initiate supply chain tracking
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

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Product Management</CardTitle>
              <CardDescription>Create and manage your product definitions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Link href="/products" className="flex-1">
                  <Button className="w-full">
                    <Package className="mr-2 h-4 w-4" />
                    Create New Product
                  </Button>
                </Link>
                <Button variant="outline">
                  <Search className="mr-2 h-4 w-4" />
                  Search Product
                </Button>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700">Recent Products</h4>
                {products.map((product, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-500">SKU: {product.sku} • {product.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">{product.batches} batches</p>
                      <Button size="sm" variant="link" className="h-auto p-0 text-xs">
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batches" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Batch Management</CardTitle>
              <CardDescription>Create batches and start shipment tracking</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <Link href="/batches?action=harvest">
                  <Button className="w-full">
                    <MapPin className="mr-2 h-4 w-4" />
                    Create New Batch
                  </Button>
                </Link>
                <Link href="/scanner">
                  <Button variant="outline" className="w-full">
                    <QrCode className="mr-2 h-4 w-4" />
                    Transfer Batch
                  </Button>
                </Link>
                <Button variant="outline" className="w-full">
                  <Activity className="mr-2 h-4 w-4" />
                  Log Event
                </Button>
              </div>

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
        </TabsContent>
      </Tabs>

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
                <li>• Create products with SKU and details</li>
                <li>• Create production batches</li>
                <li>• Transfer batch to start shipment</li>
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
