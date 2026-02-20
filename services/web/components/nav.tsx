'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Package, MapPin, FileText, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useWalletAuth } from './auth/wallet-auth-provider';
import type { AppRole } from '@/lib/wallet-auth';
import { shortenAddress } from '@/lib/wallet-auth';
const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Batches', href: '/batches', icon: MapPin },
  { name: 'Audit Trail', href: '/audit', icon: FileText },
];

export function Nav() {
  const pathname = usePathname();
  const [nextRole, setNextRole] = useState<Exclude<AppRole, 'none'> | ''>('');
  const [isChangingRole, setIsChangingRole] = useState(false);
  const { isConnected, disconnectWallet, account, role, assignMyRole } = useWalletAuth();

  const handleChangeRole = async () => {
    if (!nextRole) return;
    try {
      setIsChangingRole(true);
      await assignMyRole(nextRole);
      setNextRole('');
    } finally {
      setIsChangingRole(false);
    }
  };

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">ChainProof</span>
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
          <div className="flex items-center space-x-4">
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
                      <SelectItem value="processor">Processor</SelectItem>
                      <SelectItem value="warehouse">Warehouse</SelectItem>
                      <SelectItem value="transporter">Transporter</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
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
            ) : (
              <>
                <Link href="/auth/login">
                  <Button size="sm">Sign In</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
