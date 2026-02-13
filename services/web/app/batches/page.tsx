'use client';

import { useState } from 'react';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, Search, QrCode, Clock, Package } from 'lucide-react';

export default function BatchesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [batches] = useState([
    {
      id: '1',
      batchNumber: 'BATCH-1K5A2-XYZ12',
      product: 'Organic Coffee Beans',
      quantity: 5000,
      currentQuantity: 5000,
      status: 'in_transit',
      currentLocation: 'Port of Rotterdam',
      currentActor: 'Global Logistics Inc.',
      lastUpdate: '2 hours ago',
      traces: 5,
    },
    {
      id: '2',
      batchNumber: 'BATCH-2M8B4-ABC34',
      product: 'Premium Cocoa',
      quantity: 3000,
      currentQuantity: 3000,
      status: 'processing',
      currentLocation: 'Berlin, Germany',
      currentActor: 'Chocolate Factory Ltd.',
      lastUpdate: '5 hours ago',
      traces: 8,
    },
    {
      id: '3',
      batchNumber: 'BATCH-3N9C5-DEF56',
      product: 'Fair Trade Tea',
      quantity: 2500,
      currentQuantity: 2500,
      status: 'delivered',
      currentLocation: 'London, UK',
      currentActor: 'Organic Market Chain',
      lastUpdate: '8 hours ago',
      traces: 12,
    },
    {
      id: '4',
      batchNumber: 'BATCH-4P0D6-GHI78',
      product: 'Sustainable Cotton',
      quantity: 10000,
      currentQuantity: 10000,
      status: 'created',
      currentLocation: 'Mumbai, India',
      currentActor: 'Green Farm Co-op',
      lastUpdate: '1 day ago',
      traces: 2,
    },
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'created':
        return 'bg-gray-100 text-gray-800';
      case 'in_transit':
        return 'bg-blue-100 text-blue-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredBatches = batches.filter(
    (batch) =>
      batch.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.product.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Product Batches</h1>
            <p className="mt-2 text-gray-600">Track individual product batches through the supply chain</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Batch
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Product Batch</DialogTitle>
                <DialogDescription>Start tracking a new batch of products</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="product">Product</Label>
                  <Input id="product" placeholder="Select or enter product name" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input id="quantity" type="number" placeholder="e.g., 5000" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="location">Current Location</Label>
                  <Input id="location" placeholder="e.g., Mumbai, India" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="actor">Current Actor</Label>
                  <Input id="actor" placeholder="Select actor" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Create Batch</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search batches by number or product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="space-y-4">
          {filteredBatches.map((batch) => (
            <Card key={batch.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-semibold text-gray-900">{batch.batchNumber}</h3>
                          <Badge className={getStatusColor(batch.status)}>
                            {batch.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{batch.product}</p>
                      </div>
                      <Button variant="outline" size="sm">
                        <QrCode className="mr-2 h-4 w-4" />
                        View QR
                      </Button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                          <Package className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Quantity</p>
                          <p className="font-medium text-gray-900">
                            {batch.currentQuantity.toLocaleString()} / {batch.quantity.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                          <MapPin className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Location</p>
                          <p className="font-medium text-gray-900">{batch.currentLocation}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                          <MapPin className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Current Actor</p>
                          <p className="font-medium text-gray-900">{batch.currentActor}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
                          <Clock className="h-5 w-5 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Last Updated</p>
                          <p className="font-medium text-gray-900">{batch.lastUpdate}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-4">
                      <span className="text-sm text-gray-600">{batch.traces} trace events recorded</span>
                      <Button variant="outline" size="sm">
                        View Journey
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredBatches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No batches found</h3>
            <p className="mt-2 text-sm text-gray-600">Try adjusting your search or create a new batch.</p>
          </div>
        )}
      </main>
    </div>
  );
}
