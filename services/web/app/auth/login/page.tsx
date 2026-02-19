'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Wallet } from 'lucide-react';
import { useWalletAuth } from '@/components/auth/wallet-auth-provider';
import type { AppRole } from '@/lib/wallet-auth';
import { shortenAddress } from '@/lib/wallet-auth';

export default function LoginPage() {
  const router = useRouter();
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [requestedRole, setRequestedRole] = useState<Exclude<AppRole, 'none'> | ''>('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [localError, setLocalError] = useState('');
  const { connectWallet, assignMyRole, status, role, account, chainId, error } = useWalletAuth();

  const handleWalletLogin = async () => {
    setLocalError('');
    if (!privateKey.trim()) {
      setLocalError('Enter a private key before signing in.');
      return;
    }
    try {
      await connectWallet(privateKey);
    } catch {
      setLocalError('Manual wallet sign-in failed. Please try again.');
    }
  };

  const handleAssignRole = async () => {
    setLocalError('');
    if (!requestedRole) {
      setLocalError('Select a role before assigning.');
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

  useEffect(() => {
    if (role !== 'none' && status === 'connected') {
      router.push('/');
    }
  }, [role, router, status]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center space-x-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <Package className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">ChainProof</span>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl">Sign In With Private Key</CardTitle>
            <CardDescription>
              Your dashboard access is determined by your role assigned on-chain.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {(error || localError) && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
                {localError || error}
              </div>
            )}
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50 p-6 text-center">
                <Wallet className="mx-auto h-12 w-12 text-blue-600" />
                <p className="mt-2 text-sm font-medium text-gray-900">Enter your wallet private key</p>
                <p className="mt-1 text-xs text-gray-600">
                  Manual auth mode reads your role from ChainProof on-chain roles.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-private-key" className="text-sm font-medium">
                  Private key
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="login-private-key"
                    value={privateKey}
                    onChange={(event) => setPrivateKey(event.target.value)}
                    placeholder="0x..."
                    type={showPrivateKey ? 'text' : 'password'}
                    autoComplete="off"
                  />
                  <Button type="button" variant="outline" onClick={() => setShowPrivateKey((value) => !value)}>
                    {showPrivateKey ? 'Hide' : 'Show'}
                  </Button>
                </div>
                <p className="text-xs text-amber-700">
                  Test-only mode: this key is saved in localStorage on this browser.
                </p>
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
              {(status === 'unassigned_role' || role === 'none') && (
                <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm text-blue-900">
                    This wallet has no role yet. Assign one now to enter the app.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="assign-role" className="text-sm font-medium text-blue-900">
                      Assign role
                    </Label>
                    <Select value={requestedRole} onValueChange={(value) => setRequestedRole(value as Exclude<AppRole, 'none'>)}>
                      <SelectTrigger id="assign-role" className="bg-white">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="producer">Producer - Create products and batches</SelectItem>
                        <SelectItem value="processor">Processor - Split, merge, and transform batches</SelectItem>
                        <SelectItem value="warehouse">Warehouse - Receive, split, merge, and transfer custody</SelectItem>
                        <SelectItem value="transporter">Transporter - Move shipments</SelectItem>
                        <SelectItem value="customer">Customer - Verify product authenticity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAssignRole} className="w-full" disabled={!requestedRole || isAssigning || status === 'connecting'}>
                    {isAssigning ? 'Assigning Role...' : 'Assign Role On-Chain'}
                  </Button>
                </div>
              )}

              <Button
                onClick={handleWalletLogin}
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={status === 'connecting' || !privateKey.trim()}
              >
                <Wallet className="mr-2 h-4 w-4" />
                {status === 'connecting' ? 'Signing In...' : 'Sign In'}
              </Button>
            </div>

            {/* Sign Up Link */}
            <div className="text-center">
              <p className="text-sm text-gray-600">
                Need access?{' '}
                <Link href="/auth/signup" className="font-medium text-blue-600 hover:text-blue-700">
                  Sign up and assign role
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer Info */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center text-sm">
          <div>
            <div className="text-2xl font-bold text-gray-900">100%</div>
            <div className="text-xs text-gray-600">Secure</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">24/7</div>
            <div className="text-xs text-gray-600">Support</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">∞</div>
            <div className="text-xs text-gray-600">Traceable</div>
          </div>
        </div>

        {/* Terms */}
        <p className="mt-6 text-center text-xs text-gray-500">
          By signing in, you agree to our{' '}
          <a href="#" className="text-gray-600 hover:text-gray-700">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-gray-600 hover:text-gray-700">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
