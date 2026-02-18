'use client';

import { useState } from 'react';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Package, Plus, Search } from 'lucide-react';

export default function ProductsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products] = useState([
    {
      id: '1',
      name: 'Organic Coffee Beans',
      description: 'Premium arabica coffee beans from sustainable farms',
      sku: 'COFFEE-ORG-001',
      category: 'Food & Beverage',
      batches: 12,
    },
    {
      id: '2',
      name: 'Fair Trade Cocoa',
      description: 'Ethically sourced cocoa beans with fair trade certification',
      sku: 'COCOA-FT-002',
      category: 'Food & Beverage',
      batches: 8,
    },
    {
      id: '3',
      name: 'Sustainable Cotton',
      description: 'Organic cotton fabric from certified farms',
      sku: 'COTTON-ORG-003',
      category: 'Textile',
      batches: 15,
    },
    {
      id: '4',
      name: 'Premium Green Tea',
      description: 'High-quality green tea leaves from mountain regions',
      sku: 'TEA-GREEN-004',
      category: 'Food & Beverage',
      batches: 6,
    },
  ]);

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Products</h1>
            <p className="mt-2 text-gray-600">Manage product definitions and track their batches</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Product</DialogTitle>
                <DialogDescription>Add a new product definition to the supply chain system</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input id="name" placeholder="e.g., Organic Coffee Beans" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input id="sku" placeholder="e.g., COFFEE-ORG-001" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" placeholder="e.g., Food & Beverage" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" placeholder="Product description" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Create Product</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search products by name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{product.name}</CardTitle>
                      <p className="text-sm text-gray-500">{product.sku}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-gray-600">{product.description}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{product.category}</Badge>
                  <span className="text-sm text-gray-600">{product.batches} batches</span>
                </div>
                <Button variant="outline" className="mt-4 w-full">
                  View Details
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No products found</h3>
            <p className="mt-2 text-sm text-gray-600">Try adjusting your search or create a new product.</p>
          </div>
        )}
      </main>
    </div>
  );
}
