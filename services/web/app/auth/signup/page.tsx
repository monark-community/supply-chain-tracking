'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package, CheckCircle, Wallet } from 'lucide-react';
import { useWalletAuth } from '@/components/auth/wallet-auth-provider';
import type { AppRole } from '@/lib/wallet-auth';

export default function SignupPage() {
  const router = useRouter();
  const [requestedRole, setRequestedRole] = useState<Exclude<AppRole, 'none'> | ''>('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [message, setMessage] = useState('');
  const { connectWallet, assignMyRole, account, status, error } = useWalletAuth();

  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (!privateKey.trim()) {
      setMessage('Enter a private key before assigning role.');
      return;
    }
    if (!requestedRole) {
      setMessage('Select a role before assigning.');
      return;
    }
    try {
      setIsAssigning(true);
      await connectWallet(privateKey);
      await assignMyRole(requestedRole);
      setMessage('Role assigned on-chain. Redirecting to dashboard...');
      router.push('/');
    } finally {
      setIsAssigning(false);
    }
  };

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
            <CardTitle className="text-2xl">Manual Wallet Registration</CardTitle>
            <CardDescription>
              Enter a private key and assign your role on-chain immediately.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700 border border-blue-200">
                {message}
              </div>
            )}
            <form onSubmit={handleAssignRole} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="private-key" className="text-sm font-medium">
                  Private key
                </Label>
                <div className="flex gap-2">
                  <input
                    id="private-key"
                    value={privateKey}
                    onChange={(event) => setPrivateKey(event.target.value)}
                    placeholder="0x..."
                    type={showPrivateKey ? 'text' : 'password'}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPrivateKey((value) => !value)}
                    className="shrink-0"
                  >
                    {showPrivateKey ? 'Hide' : 'Show'}
                  </Button>
                </div>
                <p className="text-xs text-amber-700">
                  Test-only mode: this key is saved in localStorage on this browser.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role" className="text-sm font-medium">
                  Role
                </Label>
                <Select value={requestedRole} onValueChange={(value) => setRequestedRole(value as Exclude<AppRole, 'none'>)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select your role" />
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

              <div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                <p className="font-medium">Connected account</p>
                <p className="mt-1 break-all">{account || 'Not connected yet'}</p>
              </div>

              {status === 'wrong_chain' && (
                <p className="text-sm text-amber-700">
                  RPC is on the wrong chain. Update your configured ChainProof network and retry.
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={!privateKey.trim() || !requestedRole || status === 'connecting' || isAssigning}
              >
                <Wallet className="mr-2 h-4 w-4" />
                {status === 'connecting'
                  ? 'Signing In...'
                  : isAssigning
                    ? 'Assigning Role...'
                    : 'Sign In & Assign Role'}
              </Button>
            </form>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
              This self-assignment flow is test-only and should not be used in production.
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Already have a role?{' '}
                <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-700">
                  Sign in with wallet
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Why join ChainProof?</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Blockchain-verified supply chain tracking</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Real-time product traceability</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Secure multi-organization network</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
