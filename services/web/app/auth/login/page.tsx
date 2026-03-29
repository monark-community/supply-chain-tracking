'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Smartphone, Wallet } from 'lucide-react';
import { useWalletAuth } from '@/components/auth/wallet-auth-context';
import { shortenAddress } from '@/lib/wallet-auth';

export default function LoginPage() {
  const router = useRouter();
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [localError, setLocalError] = useState('');
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);

  const {
    connectWallet,
    connectWalletWith,
    walletOptions,
    manualWalletEnabled,
    status,
    role,
    account,
    chainId,
    error,
  } = useWalletAuth();

  const sortedWalletOptions = useMemo(
    () => {
      const isMetaMaskOption = (option: { id: string; name: string }) =>
        option.id === 'io.metamask' || /metamask/i.test(option.name);
      const isInjectedOption = (option: { id: string; name: string }) =>
        option.id === 'injected' || /injected/i.test(option.name);

      const hasMetaMask = walletOptions.some(isMetaMaskOption);
      const filteredOptions = hasMetaMask
        ? walletOptions.filter((option) => isMetaMaskOption(option) || !isInjectedOption(option))
        : walletOptions;

      return [...filteredOptions].sort((a, b) => {
        const aMetaMask = /metamask/i.test(a.name);
        const bMetaMask = /metamask/i.test(b.name);
        if (aMetaMask && !bMetaMask) return -1;
        if (!aMetaMask && bMetaMask) return 1;
        return a.name.localeCompare(b.name);
      });
    },
    [walletOptions]
  );

  const handleWalletLogin = async (walletId: string) => {
    setLocalError('');
    setConnectingWalletId(walletId);
    try {
      await connectWalletWith(walletId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Wallet sign-in failed. Please try again.');
    } finally {
      setConnectingWalletId(null);
    }
  };

  const handleDefaultWalletLogin = async () => {
    setLocalError('');
    setConnectingWalletId('default');
    try {
      await connectWallet();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Wallet sign-in failed. Please try again.');
    } finally {
      setConnectingWalletId(null);
    }
  };

  const handleManualWalletLogin = async () => {
    setLocalError('');
    if (!privateKey.trim()) {
      setLocalError('Enter a private key before signing in.');
      return;
    }
    setConnectingWalletId('manual');
    try {
      await connectWallet(privateKey);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Manual wallet sign-in failed. Please try again.');
    } finally {
      setConnectingWalletId(null);
    }
  };

  useEffect(() => {
    if (!account) {
      return;
    }

    if (status === 'connected' && role !== 'none') {
      router.replace('/');
      return;
    }

    if (status === 'unassigned_role' || (status === 'connected' && role === 'none')) {
      router.replace('/auth/assign-role');
    }
  }, [account, role, router, status]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-emerald-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center space-x-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <Package className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">ChainProof</span>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl">Sign In</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {(error || localError) && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{localError || error}</div>
            )}

            <div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50 p-6 text-center">
              <Wallet className="mx-auto h-12 w-12 text-blue-600" />
              <p className="mt-2 text-sm font-medium text-gray-900">Connect with MetaMask or WalletConnect</p>
            </div>

            <div className="space-y-2">
              {sortedWalletOptions.length > 0 ? (
                sortedWalletOptions.map((option) => (
                  <Button
                    key={option.id}
                    onClick={() => void handleWalletLogin(option.id)}
                    className="w-full"
                    variant={/metamask/i.test(option.name) ? 'default' : 'outline'}
                    disabled={status === 'connecting' || !!connectingWalletId}
                  >
                    <Wallet className="mr-2 h-4 w-4" />
                    {connectingWalletId === option.id ? 'Connecting...' : `Connect ${option.name}`}
                  </Button>
                ))
              ) : (
                <Button onClick={() => void handleDefaultWalletLogin()} className="w-full" disabled={status === 'connecting' || !!connectingWalletId}>
                  <Wallet className="mr-2 h-4 w-4" />
                  {connectingWalletId === 'default' ? 'Connecting...' : 'Connect Wallet'}
                </Button>
              )}
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">Apple device note</p>
              <p className="mt-1 inline-flex items-center gap-1">
                <Smartphone className="h-3.5 w-3.5" />
                On iOS, use WalletConnect and approve in MetaMask app.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <p>
                <span className="font-medium">Status:</span> {status}
              </p>
              <p>
                <span className="font-medium">Account:</span> {account ? shortenAddress(account) : 'Not connected'}
              </p>
              <p>
                <span className="font-medium">Chain:</span> {chainId ?? 'Unknown'}
              </p>
              <p>
                <span className="font-medium">Role:</span> {role}
              </p>
            </div>

            {status === 'wrong_chain' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Connected wallet is on the wrong chain. Switch to the configured ChainProof network and retry.
              </div>
            )}

            {manualWalletEnabled ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-800">Debug fallback (manual private key)</p>
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
                <Button variant="outline" className="w-full" disabled={!privateKey.trim() || !!connectingWalletId} onClick={() => void handleManualWalletLogin()}>
                  {connectingWalletId === 'manual' ? 'Signing In...' : 'Use Manual Private Key (Debug)'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
