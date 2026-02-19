'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { readChainproofSummary } from '@/lib/chainproof-read';

type SummaryState = {
  chainId: number;
  contractAddress: string;
  owner: string;
  batchCount: number;
};

export function ReadOnlyChainCard() {
  const [summary, setSummary] = useState<SummaryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await readChainproofSummary();
        if (!active) return;
        setSummary({
          chainId: data.chainId,
          contractAddress: data.contractAddress,
          owner: data.owner,
          batchCount: data.batchCount,
        });
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to load chain summary';
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card className="border-2 border-blue-200 bg-blue-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Blockchain Read-Only Mode</CardTitle>
            <CardDescription>
              Dashboard actions remain placeholders until write transaction integration.
            </CardDescription>
          </div>
          <Badge className="bg-blue-100 text-blue-800">Read-only</Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-gray-700">
        {loading && <p>Loading chain summary...</p>}
        {!loading && error && <p className="text-red-700">{error}</p>}
        {!loading && summary && (
          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              <span className="font-medium">Chain ID:</span> {summary.chainId}
            </p>
            <p>
              <span className="font-medium">Tracked batches:</span> {summary.batchCount}
            </p>
            <p>
              <span className="font-medium">Owner:</span> {summary.owner}
            </p>
            <p>
              <span className="font-medium">Contract:</span> {summary.contractAddress}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
