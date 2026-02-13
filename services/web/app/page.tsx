'use client';

import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Users, MapPin, Activity, TrendingUp, CheckCircle } from 'lucide-react';

export default function Home() {
  const stats = [
    { name: 'Total Products', value: '248', icon: Package, change: '+12%', trend: 'up' },
    { name: 'Active Batches', value: '64', icon: MapPin, change: '+8%', trend: 'up' },
    { name: 'Verified Traces', value: '1,842', icon: CheckCircle, change: '+23%', trend: 'up' },
  ];

  const recentActivity = [
    {
      id: 1,
      type: 'shipped',
      batch: 'BATCH-1K5A2-XYZ12',
      product: 'Organic Coffee Beans',
      actor: 'Global Logistics Inc.',
      location: 'Port of Rotterdam',
      time: '2 hours ago',
    },
    {
      id: 2,
      type: 'received',
      batch: 'BATCH-2M8B4-ABC34',
      product: 'Premium Cocoa',
      actor: 'Chocolate Factory Ltd.',
      location: 'Berlin, Germany',
      time: '5 hours ago',
    },
    {
      id: 3,
      type: 'inspected',
      batch: 'BATCH-3N9C5-DEF56',
      product: 'Fair Trade Tea',
      actor: 'Quality Control Corp.',
      location: 'London, UK',
      time: '8 hours ago',
    },
    {
      id: 4,
      type: 'produced',
      batch: 'BATCH-4P0D6-GHI78',
      product: 'Sustainable Cotton',
      actor: 'Green Farm Co-op',
      location: 'Mumbai, India',
      time: '1 day ago',
    },
  ];

  const actionTypeColors: Record<string, string> = {
    produced: 'bg-green-100 text-green-800',
    shipped: 'bg-blue-100 text-blue-800',
    received: 'bg-orange-100 text-orange-800',
    inspected: 'bg-purple-100 text-purple-800',
    processed: 'bg-yellow-100 text-yellow-800',
    delivered: 'bg-emerald-100 text-emerald-800',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Supply Chain Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Track and trace products across your entire supply chain with blockchain-verified transparency
          </p>
        </div>

        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
                  <p className="mt-1 flex items-center text-xs text-gray-600">
                    <TrendingUp className="mr-1 h-3 w-3 text-green-600" />
                    <span className="text-green-600">{stat.change}</span>
                    <span className="ml-1">from last month</span>
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest supply chain events across all products</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                        <Activity className="h-5 w-5 text-gray-600" />
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            actionTypeColors[activity.type] || 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {activity.type}
                        </span>
                        <span className="text-sm font-medium text-gray-900">{activity.product}</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">{activity.actor}</span> · {activity.location}
                      </p>
                      <p className="text-xs text-gray-500">Batch: {activity.batch}</p>
                    </div>
                    <div className="flex-shrink-0 text-xs text-gray-500">{activity.time}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks to manage your supply chain</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <button className="flex items-center justify-between rounded-lg border-2 border-gray-200 p-4 text-left transition-all hover:border-blue-600 hover:bg-blue-50">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Create New Product</p>
                      <p className="text-sm text-gray-600">Add a new product definition</p>
                    </div>
                  </div>
                </button>

                <button className="flex items-center justify-between rounded-lg border-2 border-gray-200 p-4 text-left transition-all hover:border-blue-600 hover:bg-blue-50">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                      <MapPin className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Create Product Batch</p>
                      <p className="text-sm text-gray-600">Start tracking a new batch</p>
                    </div>
                  </div>
                </button>

                <button className="flex items-center justify-between rounded-lg border-2 border-gray-200 p-4 text-left transition-all hover:border-blue-600 hover:bg-blue-50">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                      <Activity className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Record Trace Event</p>
                      <p className="text-sm text-gray-600">Log a supply chain checkpoint</p>
                    </div>
                  </div>
                </button>

              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>System Overview</CardTitle>
            <CardDescription>Real-time blockchain-verified supply chain transparency</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h4 className="font-medium text-gray-900">Tamper-Proof Records</h4>
                </div>
                <p className="text-sm text-gray-600">
                  All supply chain events are recorded on-chain with cryptographic verification, ensuring data integrity.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h4 className="font-medium text-gray-900">Complete Traceability</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Track products from origin to destination with full visibility into every step of the journey.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h4 className="font-medium text-gray-900">Multi-Stakeholder Access</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Producers, transporters, processors, and retailers all contribute to a shared, trusted record.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
