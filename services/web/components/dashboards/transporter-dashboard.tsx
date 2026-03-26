'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReadOnlyChainCard } from './read-only-chain-card';
import { readTransporterCustodyShipments, type TransporterCustodyShipment } from '@/lib/chainproof-read';
import { useWalletAuth } from '@/components/auth/wallet-auth-provider';
import { BATCH_ENV_UPDATE_EVENT, getBatchEnvironmentAlert } from '@/lib/environment-alerts';

export function TransporterDashboard() {
  const { account } = useWalletAuth();
  const [activeShipments, setActiveShipments] = useState<TransporterCustodyShipment[]>([]);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [shipmentsError, setShipmentsError] = useState<string | null>(null);
  const [, setEnvRefreshTick] = useState(0);

  useEffect(() => {
    if (!account) {
      setActiveShipments([]);
      setShipmentsError(null);
      return;
    }

    let mounted = true;
    const loadShipments = async () => {
      setLoadingShipments(true);
      setShipmentsError(null);
      try {
        const shipments = await readTransporterCustodyShipments(account, 20);
        if (!mounted) return;
        setActiveShipments(shipments);
      } catch (error) {
        if (!mounted) return;
        setActiveShipments([]);
        setShipmentsError(error instanceof Error ? error.message : 'Failed to load active shipments.');
      } finally {
        if (mounted) setLoadingShipments(false);
      }
    };

    void loadShipments();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Transporter Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Move shipments between facilities and maintain custody continuity
        </p>
      </div>

      <ReadOnlyChainCard />

      <Card>
        <CardHeader>
          <CardTitle>Active Shipments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingShipments ? <p className="text-sm text-gray-600">Loading active shipments...</p> : null}
          {shipmentsError ? <p className="text-sm text-red-600">{shipmentsError}</p> : null}
          {!loadingShipments && !shipmentsError && activeShipments.length === 0 ? (
            <p className="text-sm text-gray-600">No active shipments in your custody.</p>
          ) : null}

          {!loadingShipments && !shipmentsError && activeShipments.length > 0 ? (
            <div className="space-y-3">
              {activeShipments.map((item) => (
                <div
                  key={item.batchId}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    getBatchEnvironmentAlert(item.batchId).breached ? 'border-red-200 bg-red-50/40' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">Batch {item.batchId}</p>
                    <p className="text-xs text-gray-600">
                      Tracking: {item.trackingCode || 'N/A'} | Origin: {item.origin || 'N/A'} | Qty: {item.quantity}
                    </p>
                    {(() => {
                      const envAlert = getBatchEnvironmentAlert(item.batchId);
                      if (!envAlert.hasData || !envAlert.breached) return null;
                      return (
                        <p className="inline-flex items-center gap-1 text-xs text-red-700">
                          <AlertTriangle className="h-3 w-3" />
                          {envAlert.details}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-blue-700">{item.status === 'ACTIVE' ? 'Active' : 'Consumed'}</p>
                    <p className="text-xs text-gray-500">{formatTimestamp(item.updatedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-lg border bg-slate-50 p-4">
            <p className="text-sm text-slate-700">Receiving a shipment?</p>
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
