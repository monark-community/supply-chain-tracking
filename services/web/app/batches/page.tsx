'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Nav } from '@/components/nav';
import { Card, CardContent } from '@/components/ui/card';
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
import { MapPin, Plus, Search, Clock, Package } from 'lucide-react';
import { harvestProducerBatch } from '@/lib/chainproof-write';
import { readBatchByTrackingOrId } from '@/lib/chainproof-read';
import { useWalletAuth } from '@/components/auth/wallet-auth-provider';

type BatchItem = {
  id: string;
  batchNumber: string;
  product: string;
  quantity: number;
  currentQuantity: number;
  status: string;
  currentLocation: string;
  currentCustodian: string;
  lastUpdate: string;
  traces: number;
  details?: BatchDetails;
};

type BatchTimelineEvent = {
  type: string;
  text: string;
  timestamp: number;
  txHash: string;
};

type BatchDetails = {
  chainId: number;
  contractAddress: string;
  creator: string;
  origin: string;
  ipfsHash: string;
  quantity: number;
  trackingCode: string;
  status: number;
  createdAt: number;
  updatedAt: number;
  currentHandler: string;
  parents: number[];
  children: number[];
  timeline: BatchTimelineEvent[];
};

type HarvestFeedback = {
  type: 'success' | 'error';
  message: string;
  txHash?: string;
  newBatchId?: number | null;
  chainId?: number;
  contractAddress?: string;
  ipfsHash?: string;
};

type TrackFeedback = {
  type: 'error';
  message: string;
};

function shortenAddress(value: string) {
  if (!value || value.length < 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

const TRACKED_BATCHES_KEY_PREFIX = 'chainproof:tracked-batches';

function getStorageKey(account: string | null) {
  if (!account) return null;
  return `${TRACKED_BATCHES_KEY_PREFIX}:${account.toLowerCase()}`;
}

function formatTimestamp(timestamp: number) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp * 1000).toLocaleString();
}

function getStatusLabel(status: number) {
  switch (status) {
    case 0:
      return 'created';
    case 1:
      return 'in_transit';
    case 2:
      return 'processing';
    case 3:
      return 'delivered';
    case 4:
      return 'completed';
    default:
      return 'unknown';
  }
}

export default function BatchesPage() {
  const searchParams = useSearchParams();
  const { role, account } = useWalletAuth();
  const isProducer = role === 'producer';
  const storageKey = useMemo(() => getStorageKey(account), [account]);

  const [searchTerm, setSearchTerm] = useState('');
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [hasHydratedStorage, setHasHydratedStorage] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [origin, setOrigin] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<HarvestFeedback | null>(null);
  const [trackDialogOpen, setTrackDialogOpen] = useState(false);
  const [trackLookup, setTrackLookup] = useState('');
  const [trackingSubmitting, setTrackingSubmitting] = useState(false);
  const [trackFeedback, setTrackFeedback] = useState<TrackFeedback | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchItem | null>(null);

  useEffect(() => {
    if (isProducer && searchParams.get('action') === 'harvest') {
      setDialogOpen(true);
    }
  }, [searchParams, isProducer]);

  useEffect(() => {
    setHasHydratedStorage(false);
    if (!storageKey) {
      setBatches([]);
      setHasHydratedStorage(true);
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(storageKey);
      if (!rawValue) {
        setBatches([]);
      } else {
        const parsed = JSON.parse(rawValue) as BatchItem[];
        setBatches(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      setBatches([]);
    } finally {
      setHasHydratedStorage(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hasHydratedStorage) return;
    window.localStorage.setItem(storageKey, JSON.stringify(batches));
  }, [batches, storageKey, hasHydratedStorage]);

  const resetForm = () => {
    setOrigin('');
    setQuantityInput('');
    setTrackingCode('');
  };

  const handleCreateBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const quantity = Number(quantityInput);
      const result = await harvestProducerBatch({
        origin,
        quantity,
        trackingCode,
      });

      setBatches((current) => [
        {
          id: result.newBatchId ? String(result.newBatchId) : `new-${Date.now()}`,
          batchNumber: trackingCode.trim(),
          product: origin.trim(),
          quantity,
          currentQuantity: quantity,
          status: 'created',
          currentLocation: 'On-chain harvest',
          currentCustodian: shortenAddress(result.account),
          lastUpdate: 'just now',
          traces: 1,
          details: result.newBatchId
            ? {
                chainId: result.chainId,
                contractAddress: result.contractAddress,
                creator: result.account,
                origin: origin.trim(),
                ipfsHash: result.ipfsHash,
                quantity,
                trackingCode: trackingCode.trim(),
                status: 0,
                createdAt: Math.floor(Date.now() / 1000),
                updatedAt: Math.floor(Date.now() / 1000),
                currentHandler: result.account,
                parents: [],
                children: [],
                timeline: [
                  {
                    type: 'HARVEST',
                    text: `Harvested by ${result.account}`,
                    timestamp: Math.floor(Date.now() / 1000),
                    txHash: result.txHash,
                  },
                ],
              }
            : undefined,
        },
        ...current,
      ]);

      setFeedback({
        type: 'success',
        message: 'Batch harvested on-chain successfully.',
        txHash: result.txHash,
        newBatchId: result.newBatchId,
        chainId: result.chainId,
        contractAddress: result.contractAddress,
        ipfsHash: result.ipfsHash,
      });
      resetForm();
      setDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create batch.';
      setFeedback({
        type: 'error',
        message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrackBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTrackingSubmitting(true);
    setTrackFeedback(null);

    try {
      const result = await readBatchByTrackingOrId(trackLookup);
      const item: BatchItem = {
        id: String(result.batch.id),
        batchNumber: result.batch.trackingCode || String(result.batch.id),
        product: result.batch.origin || 'Unknown Product',
        quantity: result.batch.quantity,
        currentQuantity: result.batch.quantity,
        status: getStatusLabel(result.batch.status),
        currentLocation: `Chain ${result.chainId}`,
        currentCustodian: shortenAddress(result.batch.currentHandler),
        lastUpdate: formatTimestamp(result.batch.updatedAt),
        traces: result.timeline.length,
        details: {
          chainId: result.chainId,
          contractAddress: result.contractAddress,
          creator: result.batch.creator,
          origin: result.batch.origin,
          ipfsHash: result.batch.ipfsHash,
          quantity: result.batch.quantity,
          trackingCode: result.batch.trackingCode,
          status: result.batch.status,
          createdAt: result.batch.createdAt,
          updatedAt: result.batch.updatedAt,
          currentHandler: result.batch.currentHandler,
          parents: result.parents,
          children: result.children,
          timeline: result.timeline,
        },
      };

      setBatches((current) => {
        const existingIndex = current.findIndex((batch) => batch.id === item.id);
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = item;
          return next;
        }
        return [item, ...current];
      });

      setTrackLookup('');
      setTrackDialogOpen(false);
      setSelectedBatch(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to track batch.';
      setTrackFeedback({
        type: 'error',
        message,
      });
    } finally {
      setTrackingSubmitting(false);
    }
  };

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
            <p className="mt-2 text-gray-600">Current batches you are tracking</p>
          </div>
          <div className="flex items-center gap-2">
            {isProducer && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Batch
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreateBatch}>
                    <DialogHeader>
                      <DialogTitle>Create Product Batch</DialogTitle>
                      <DialogDescription>
                        Submit a Producer harvest transaction. Temporary IPFS hash will be generated automatically.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="origin">Origin / Product Label</Label>
                        <Input
                          id="origin"
                          value={origin}
                          onChange={(e) => setOrigin(e.target.value)}
                          placeholder="e.g., Ethiopia - Yirgacheffe"
                          disabled={submitting}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="tracking-code">Tracking Code</Label>
                        <Input
                          id="tracking-code"
                          value={trackingCode}
                          onChange={(e) => setTrackingCode(e.target.value)}
                          placeholder="e.g., BATCH-2026-001"
                          disabled={submitting}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="quantity">Quantity</Label>
                        <Input
                          id="quantity"
                          type="number"
                          value={quantityInput}
                          onChange={(e) => setQuantityInput(e.target.value)}
                          placeholder="e.g., 5000"
                          min={1}
                          disabled={submitting}
                        />
                      </div>
                    </div>
                    {feedback?.type === 'error' && <p className="pb-3 text-sm text-red-600">{feedback.message}</p>}
                    <DialogFooter>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? 'Submitting transaction...' : 'Create Batch'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}

            <Dialog open={trackDialogOpen} onOpenChange={setTrackDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Search className="mr-2 h-4 w-4" />
                  Track Batch
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleTrackBatch}>
                  <DialogHeader>
                    <DialogTitle>Track a Batch</DialogTitle>
                    <DialogDescription>Enter a numeric batch ID or tracking code to add it to your tracked list.</DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="track-lookup">Batch ID or tracking code</Label>
                    <Input
                      id="track-lookup"
                      value={trackLookup}
                      onChange={(event) => setTrackLookup(event.target.value)}
                      placeholder="e.g., 12 or BATCH-2026-001"
                      disabled={trackingSubmitting}
                    />
                  </div>
                  {trackFeedback?.type === 'error' && <p className="pb-3 text-sm text-red-600">{trackFeedback.message}</p>}
                  <DialogFooter>
                    <Button type="submit" disabled={trackingSubmitting || !trackLookup.trim()}>
                      {trackingSubmitting ? 'Looking up batch...' : 'Track Batch'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Dialog open={!!selectedBatch} onOpenChange={(open) => (!open ? setSelectedBatch(null) : undefined)}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedBatch?.batchNumber || 'Batch details'}</DialogTitle>
              <DialogDescription>
                {selectedBatch?.product || 'Tracked batch'} {selectedBatch?.details ? 'with full journey history.' : ''}
              </DialogDescription>
            </DialogHeader>
            {selectedBatch && (
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-gray-500">Status</p>
                    <p className="font-medium text-gray-900">{selectedBatch.status.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Current Custodian</p>
                    <p className="font-medium text-gray-900">{selectedBatch.currentCustodian}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Quantity</p>
                    <p className="font-medium text-gray-900">{selectedBatch.currentQuantity.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Last Updated</p>
                    <p className="font-medium text-gray-900">{selectedBatch.lastUpdate}</p>
                  </div>
                  {selectedBatch.details && (
                    <>
                      <div>
                        <p className="text-gray-500">Chain</p>
                        <p className="font-medium text-gray-900">{selectedBatch.details.chainId}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Contract</p>
                        <p className="font-medium text-gray-900 break-all">{selectedBatch.details.contractAddress}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Parents</p>
                        <p className="font-medium text-gray-900">
                          {selectedBatch.details.parents.length ? selectedBatch.details.parents.join(', ') : 'None'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Children</p>
                        <p className="font-medium text-gray-900">
                          {selectedBatch.details.children.length ? selectedBatch.details.children.join(', ') : 'None'}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-3 border-t pt-3">
                  <h4 className="font-semibold text-gray-900">Batch History</h4>
                  {!selectedBatch.details?.timeline.length ? (
                    <p className="text-gray-600">No recorded timeline events for this batch yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedBatch.details.timeline.map((event, index) => (
                        <div key={`${event.txHash}-${index}`} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-900">{event.type}</span>
                            <span className="text-xs text-gray-500">{formatTimestamp(event.timestamp)}</span>
                          </div>
                          <p className="mt-1 text-gray-700">{event.text}</p>
                          <p className="mt-1 break-all text-xs text-gray-500">tx: {event.txHash}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {feedback?.type === 'success' && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <CardContent className="space-y-1 pt-6 text-sm text-green-900">
              <p className="font-medium">{feedback.message}</p>
              <p>Batch ID: {feedback.newBatchId ?? 'Pending event parse'}</p>
              <p>Chain: {feedback.chainId}</p>
              <p>Contract: {feedback.contractAddress}</p>
              <p className="break-all">Tx Hash: {feedback.txHash}</p>
              <p className="break-all">Temp IPFS: {feedback.ipfsHash}</p>
            </CardContent>
          </Card>
        )}

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
                      <Button variant="outline" size="sm" onClick={() => setSelectedBatch(batch)}>
                        View Details
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
                          <p className="text-xs text-gray-500">Current Custodian</p>
                          <p className="font-medium text-gray-900">{batch.currentCustodian}</p>
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
            <p className="mt-2 text-sm text-gray-600">Try tracking a batch by ID or tracking code.</p>
          </div>
        )}
      </main>
    </div>
  );
}
