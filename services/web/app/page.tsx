'use client';

import Link from 'next/link';
import { Nav } from '@/components/nav';
import { ProducerDashboard } from '@/components/dashboards/producer-dashboard';
import { TransporterDashboard } from '@/components/dashboards/transporter-dashboard';
import { ProcessorDashboard } from '@/components/dashboards/processor-dashboard';
import { CustomerDashboard } from '@/components/dashboards/customer-dashboard';
import { WarehouseDashboard } from '@/components/dashboards/warehouse-dashboard';
import { Button } from '@/components/ui/button';
import { useWalletAuth } from '@/components/auth/wallet-auth-provider';
import { shortenAddress } from '@/lib/wallet-auth';

export default function Home() {
  const { role, status, account } = useWalletAuth();

  const renderDashboard = () => {
    switch (role) {
      case 'producer':
        return <ProducerDashboard />;
      case 'transporter':
        return <TransporterDashboard />;
      case 'processor':
        return <ProcessorDashboard />;
      case 'warehouse':
        return <WarehouseDashboard />;
      case 'customer':
        return <CustomerDashboard />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {role !== 'none' ? (
          <>
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
              <p><span className="font-medium">Connected account:</span> {account ? shortenAddress(account) : 'Unknown'}</p>
              <p><span className="font-medium">Resolved role:</span> {role}</p>
            </div>
            {renderDashboard()}
          </>
        ) : (
          <div className="mx-auto max-w-xl rounded-xl border border-blue-200 bg-blue-50 p-6">
            <h2 className="text-lg font-semibold text-blue-900">Role not assigned</h2>
            <p className="mt-2 text-sm text-blue-800">
              This wallet does not have an on-chain role yet. Assign one in signup/login, then come back.
            </p>
            <div className="mt-4 rounded-md border border-blue-200 bg-white p-3 text-sm text-blue-900">
              <p><span className="font-medium">Status:</span> {status}</p>
              <p><span className="font-medium">Connected account:</span> {account ? shortenAddress(account) : 'Not connected'}</p>
            </div>
            <div className="mt-4 flex gap-3">
              <Link href="/auth/signup">
                <Button>Sign In & Assign Role</Button>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
