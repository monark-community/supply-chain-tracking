'use client';

import { useState } from 'react';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Search, Clock, User, Package, MapPin } from 'lucide-react';

export default function AuditPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  const auditLogs = [
    {
      id: '1',
      action: 'Created Product',
      user: 'John Smith',
      entityType: 'product',
      entityName: 'Organic Coffee Beans',
      timestamp: '2025-10-17 10:30',
      details: 'New product created with SKU COFFEE-ORG-001',
    },
    {
      id: '2',
      action: 'Created Batch',
      user: 'John Smith',
      entityType: 'batch',
      entityName: 'BATCH-1K5A2-XYZ12',
      timestamp: '2025-10-17 08:45',
      details: 'New batch created for Organic Coffee Beans with 5000 units',
    },
    {
      id: '3',
      action: 'Recorded Trace',
      user: 'Mike Chen',
      entityType: 'trace',
      entityName: 'Shipped from Mumbai',
      timestamp: '2025-10-16 16:20',
      details: 'Transfer recorded: Green Valley Farms -> Central Processor',
    },
    {
      id: '4',
      action: 'Updated Batch Status',
      user: 'Emily Davis',
      entityType: 'batch',
      entityName: 'BATCH-1K5A2-XYZ12',
      timestamp: '2025-10-16 14:00',
      details: 'Batch status changed from created to in_transit',
    },
    {
      id: '5',
      action: 'Verified Trace',
      user: 'System',
      entityType: 'trace',
      entityName: 'Quality Inspection',
      timestamp: '2025-10-16 12:30',
      details: 'Blockchain verification completed for trace event',
    },
    {
      id: '6',
      action: 'Created Product',
      user: 'Sarah Johnson',
      entityType: 'product',
      entityName: 'Premium Cocoa',
      timestamp: '2025-10-15 15:45',
      details: 'New product created with SKU COCOA-FT-002',
    },
  ];

  const getActionColor = (entityType: string) => {
    const colors: Record<string, string> = {
      product: 'bg-blue-100 text-blue-800',
      batch: 'bg-purple-100 text-purple-800',
      trace: 'bg-orange-100 text-orange-800',
    };
    return colors[entityType] || 'bg-gray-100 text-gray-800';
  };

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'product':
        return Package;
      case 'batch':
        return MapPin;
      case 'trace':
        return Clock;
      default:
        return FileText;
    }
  };

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || log.entityType === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Audit Trail</h1>
          <p className="mt-2 text-gray-600">
            Comprehensive log of all system activities and blockchain transactions
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  <SelectItem value="batch">Batches</SelectItem>
                  <SelectItem value="trace">Traces</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {filteredLogs.map((log) => {
            const Icon = getEntityIcon(log.entityType);
            return (
              <Card key={log.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${getActionColor(log.entityType).replace('text-', 'bg-').replace('-800', '-100')}`}>
                      <Icon className={`h-5 w-5 ${getActionColor(log.entityType).split(' ')[1]}`} />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-semibold text-gray-900">{log.action}</h3>
                            <Badge className={getActionColor(log.entityType)}>{log.entityType}</Badge>
                          </div>
                          <p className="mt-1 text-sm font-medium text-gray-700">{log.entityName}</p>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span className="flex items-center">
                            <Clock className="mr-1 h-3 w-3" />
                            {log.timestamp}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">{log.details}</p>
                        <div className="flex items-center text-sm text-gray-500">
                          <User className="mr-1 h-3 w-3" />
                          {log.user}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredLogs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No audit logs found</h3>
            <p className="mt-2 text-sm text-gray-600">Try adjusting your search or filter criteria.</p>
          </div>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Blockchain Verification</CardTitle>
            <CardDescription>All critical events are verified on-chain</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <p className="text-2xl font-bold text-gray-900">1,842</p>
                <p className="text-sm text-gray-600">Verified Transactions</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-gray-900">100%</p>
                <p className="text-sm text-gray-600">Data Integrity</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-gray-900">0</p>
                <p className="text-sm text-gray-600">Failed Verifications</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
