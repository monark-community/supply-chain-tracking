'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Package, MapPin, LayoutDashboard, QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useWalletAuth } from './auth/wallet-auth-context';
import type { AppRole } from '@/lib/wallet-auth';
import { shortenAddress } from '@/lib/wallet-auth';

const CHANGEABLE_ROLES: Array<Exclude<AppRole, 'none' | 'processor' | 'customer'>> = [
  'producer',
  'warehouse',
  'transporter',
];

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Batches', href: '/batches', icon: MapPin },
  { name: 'Batch Actions', href: '/scanner', icon: QrCode },
];

export function Nav() {
  const pathname = usePathname();
  const [nextRole, setNextRole] = useState<Exclude<AppRole, 'none'> | ''>('');
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [isSyncingAccount, setIsSyncingAccount] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { isConnected, disconnectWallet, account, role, assignMyRole, syncMobileWalletAccount } = useWalletAuth();

  const handleChangeRole = async () => {
    if (!nextRole) return;
    if (!CHANGEABLE_ROLES.includes(nextRole as (typeof CHANGEABLE_ROLES)[number])) return;
    try {
      setIsChangingRole(true);
      await assignMyRole(nextRole);
      setNextRole('');
    } finally {
      setIsChangingRole(false);
    }
  };

  const handleMobileSync = async () => {
    try {
      setSyncError(null);
      setIsSyncingAccount(true);
      await syncMobileWalletAccount();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Unable to sync wallet account.');
    } finally {
      setIsSyncingAccount(false);
    }
  };

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3 md:h-16 md:flex-nowrap md:py-0">
          <div className="flex min-w-0 items-center">
            <Link href="/" className="flex min-w-0 items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="truncate text-lg font-bold text-gray-900 sm:text-xl">ChainProof</span>
            </Link>
            <nav className="ml-10 hidden space-x-1 md:flex">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center space-x-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex shrink-0 items-center space-x-2 sm:space-x-4">
            {isConnected ? (
              <>
                <div className="hidden rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 sm:block">
                  {shortenAddress(account || '')} • {role}
                </div>
                <div className="hidden items-center gap-2 lg:flex">
                  <Select value={nextRole} onValueChange={(value) => setNextRole(value as Exclude<AppRole, 'none'>)}>
                    <SelectTrigger className="h-8 w-[170px] text-xs">
                      <SelectValue placeholder="Change my role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="producer">Producer</SelectItem>
                      <SelectItem value="warehouse">Warehouse</SelectItem>
                      <SelectItem value="transporter">Transporter</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => void handleChangeRole()} disabled={!nextRole || isChangingRole}>
                    {isChangingRole ? 'Assigning...' : 'Apply'}
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={disconnectWallet}>
                  Disconnect
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="border-t border-gray-200 py-3 md:hidden">
          <nav className="grid grid-cols-3 gap-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg px-2 py-2 text-[11px] font-medium transition-colors',
                    isActive
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <Icon className="mb-1 h-4 w-4" />
                  <span className="text-center leading-tight">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {isConnected ? (
            <div className="mt-3 space-y-2">
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700">
                {shortenAddress(account || '')} • {role}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void handleMobileSync()} disabled={isSyncingAccount}>
                  {isSyncingAccount ? 'Syncing...' : 'Sync account'}
                </Button>
              </div>
              {syncError ? (
                <p className="text-xs text-red-600">{syncError}</p>
              ) : null}
              <div className="flex items-center gap-2">
                <Select value={nextRole} onValueChange={(value) => setNextRole(value as Exclude<AppRole, 'none'>)}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder="Change my role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producer">Producer</SelectItem>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="transporter">Transporter</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => void handleChangeRole()} disabled={!nextRole || isChangingRole}>
                  {isChangingRole ? 'Assigning...' : 'Apply'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
