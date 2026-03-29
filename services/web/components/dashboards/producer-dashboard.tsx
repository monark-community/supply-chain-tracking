'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReadOnlyChainCard } from './read-only-chain-card';
import { readProducerRecentActivity, type ProducerRecentActivity } from '@/lib/chainproof-read';
import { useWalletAuth } from '@/components/auth/wallet-auth-context';
import { BATCH_ENV_UPDATE_EVENT, getBatchEnvironmentAlert } from '@/lib/environment-alerts';

export function ProducerDashboard() {
  const { account } = useWalletAuth();
  const [recentActivity, setRecentActivity] = useState<ProducerRecentActivity[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [, setEnvRefreshTick] = useState(0);

  useEffect(() => {
    if (!account) {
      setRecentActivity([]);
      setActivityError(null);
      return;
    }

    let mounted = true;
    const loadRecentActivity = async () => {
      setLoadingActivity(true);
      setActivityError(null);
      try {
        const activity = await readProducerRecentActivity(account, 10);
        if (!mounted) return;
        setRecentActivity(activity);
      } catch (error) {
        if (!mounted) return;
        setRecentActivity([]);
        setActivityError(error instanceof Error ? error.message : 'Failed to load recent activity.');
      } finally {
        if (mounted) setLoadingActivity(false);
      }
    };

    void loadRecentActivity();
    return () => {
      mounted = false;
    };
  }, [account]);

  useEffect(() => {
    const handleEnvUpdate = () => setEnvRefreshTick((value) => value + 1);
    window.addEventListener(BATCH_ENV_UPDATE_EVENT, handleEnvUpdate);
    return () => {
      window.removeEventListener(BATCH_ENV_UPDATE_EVENT, handleEnvUpdate);
    };
  }, []);

  const formatTimestamp = (timestamp: number) => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown time';
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, now - timestamp);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const formatType = (type: ProducerRecentActivity['type']) => {
    if (type === 'CREATED') return 'Created';
    return 'Transfer initiated';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Producer Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Manage batches and initiate supply chain tracking
        </p>
      </div>

      <ReadOnlyChainCard />

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingActivity ? <p className="text-sm text-gray-600">Loading recent activity...</p> : null}
          {activityError ? <p className="text-sm text-red-600">{activityError}</p> : null}
          {!loadingActivity && !activityError && recentActivity.length === 0 ? (
            <p className="text-sm text-gray-600">No recent activity.</p>
          ) : null}

          {!loadingActivity && !activityError && recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((item) => (
                <div
                  key={`${item.type}-${item.txHash}`}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    getBatchEnvironmentAlert(item.batchId).breached ? 'border-red-200 bg-red-50/40' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">{formatType(item.type)} • Batch {item.batchId}</p>
                    <p className="text-xs text-gray-600">{item.description}</p>
                    {(() => {
                      const envAlert = getBatchEnvironmentAlert(item.batchId);
                      if (!envAlert.hasData || !envAlert.breached) return null;
                      return (
                        <p className="inline-flex items-center gap-1 text-xs text-red-700">
                          <AlertTriangle className="h-3 w-3" />
                          {envAlert.summary}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{formatTimestamp(item.timestamp)}</p>
                    <p className="text-xs text-gray-500">{item.txHash.slice(0, 10)}...{item.txHash.slice(-6)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-lg border bg-slate-50 p-4">
            <p className="text-sm text-slate-700">Want to create a batch or initiate a transfer?</p>
            <div className="mt-3">
              <Link href="/scanner">
                <Button variant="outline">
                  <QrCode className="mr-2 h-4 w-4" />
                  Open NFC Console
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
