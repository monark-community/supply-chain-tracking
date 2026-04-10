'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, ShieldCheck } from 'lucide-react';
import { useWalletAuth } from '@/components/auth/wallet-auth-context';
import type { AppRole } from '@/lib/wallet-auth';
import { shortenAddress } from '@/lib/wallet-auth';
import { readPendingNfcScan } from '@/lib/nfc-scan-session';

const ASSIGNABLE_ROLES: Array<Exclude<AppRole, 'none' | 'processor' | 'customer'>> = [
  'producer',
  'warehouse',
  'transporter',
];

export default function AssignRolePage() {
  const router = useRouter();
  const [requestedRole, setRequestedRole] = useState<Exclude<AppRole, 'none'> | ''>('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [localError, setLocalError] = useState('');
  const { status, role, account, chainId, error, assignMyRole, disconnectWallet } = useWalletAuth();

  const handleAssignRole = async () => {
    setLocalError('');
    if (!requestedRole) {
      setLocalError('Select a role before assigning.');
      return;
    }
    if (!ASSIGNABLE_ROLES.includes(requestedRole as (typeof ASSIGNABLE_ROLES)[number])) {
      setLocalError('Selected role is temporarily unavailable.');
      return;
    }
    try {
      setIsAssigning(true);
      await assignMyRole(requestedRole);
    } catch {
      setLocalError('Role assignment failed. Check wallet confirmation and retry.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleBackToSignIn = () => {
    disconnectWallet();
    router.push('/auth/login');
  };

  useEffect(() => {
    if (status === 'wrong_chain') {
      router.replace('/auth/login?reason=wrong_chain');
      return;
    }
    if (status === 'error') {
      router.replace('/auth/login?reason=session_error');
      return;
    }
    if (status === 'disconnected') {
      router.replace('/auth/login');
      return;
    }
    if (!account && status !== 'connecting' && status !== 'idle') {
      router.replace('/auth/login');
      return;
    }
    if (role !== 'none' && status === 'connected') {
      const pendingScan = readPendingNfcScan();
      router.replace(pendingScan?.continueTo || '/');
    }
  }, [account, role, router, status]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center space-x-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <Package className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">ChainProof</span>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl">Assign Role</CardTitle>
            <CardDescription>
              Signed in successfully. Choose your on-chain role to continue.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {(error || localError) && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {localError || error}
              </div>
            )}

            <div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50 p-6 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-blue-600" />
              <p className="mt-2 text-sm font-medium text-gray-900">No role found for this wallet</p>
              <p className="mt-1 text-xs text-gray-600">Assign one role to unlock your dashboard access.</p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <p><span className="font-medium">Status:</span> {status}</p>
              <p><span className="font-medium">Account:</span> {account ? shortenAddress(account) : 'Not connected'}</p>
              <p><span className="font-medium">Chain:</span> {chainId ?? 'Unknown'}</p>
              <p><span className="font-medium">Role:</span> {role}</p>
            </div>

            {status === 'wrong_chain' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                RPC is on the wrong chain. Update your ChainProof configured network and retry.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="assign-role">Assign role</Label>
              <Select value={requestedRole} onValueChange={(value) => setRequestedRole(value as Exclude<AppRole, 'none'>)}>
                <SelectTrigger id="assign-role" className="bg-white">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="producer">Producer - Create and manage batches</SelectItem>
                  <SelectItem value="warehouse">Warehouse - Receive, split, merge, and transfer custody</SelectItem>
                  <SelectItem value="transporter">Transporter - Move shipments</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleAssignRole}
              className="w-full"
              disabled={!requestedRole || isAssigning || status === 'connecting' || status === 'wrong_chain'}
            >
              {isAssigning ? 'Assigning Role...' : 'Assign Role On-Chain'}
            </Button>

            <div className="text-center text-sm text-gray-600">
              Need to switch wallet?{' '}
              <button
                type="button"
                onClick={handleBackToSignIn}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                Back to sign in
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
