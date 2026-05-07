'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, QrCode, Smartphone } from 'lucide-react';
import { useWalletAuth } from '@/components/auth/wallet-auth-context';
import { MetaMaskFoxIcon } from '@/components/icons/metamask-fox';
import { shortenAddress } from '@/lib/wallet-auth';
import { readPendingNfcScan } from '@/lib/nfc-scan-session';

const METAMASK_CONNECTOR_ID = 'io.metamask';
const WALLETCONNECT_CONNECTOR_ID = 'walletConnect';

function isAlreadyConnectedMessage(message: string) {
  return message.toLowerCase().includes('already connected');
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localError, setLocalError] = useState('');
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const redirectReason = searchParams.get('reason');

  const {
    connectWalletWith,
    walletOptions,
    status,
    role,
    account,
    chainId,
    error,
  } = useWalletAuth();

  const metaMaskOption = useMemo(
    () => walletOptions.find((option) => option.id === METAMASK_CONNECTOR_ID),
    [walletOptions]
  );
  const walletConnectOption = useMemo(
    () => walletOptions.find((option) => option.id === WALLETCONNECT_CONNECTOR_ID),
    [walletOptions]
  );

  const redirectReasonMessage = useMemo(() => {
    if (redirectReason === 'wrong_chain') {
      return 'Wallet session was detected on the wrong network. Tap WalletConnect to auto-recover to the ChainProof network.';
    }
    if (redirectReason === 'session_timeout') {
      return 'Wallet session check took too long. Please reconnect to continue NFC flow.';
    }
    if (redirectReason === 'session_error') {
      return 'Wallet session could not be restored. Please reconnect to continue.';
    }
    return '';
  }, [redirectReason]);

  const combinedError = localError || error || '';
  const showingAlreadyConnectedRecovery = isAlreadyConnectedMessage(combinedError);

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

  useEffect(() => {
    if (!account) {
      return;
    }

    const pendingScan = readPendingNfcScan();
    const postAuthRoute = pendingScan?.continueTo || '/';

    if (status === 'connected' && role !== 'none') {
      router.replace(postAuthRoute);
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
            {combinedError && !showingAlreadyConnectedRecovery ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{combinedError}</div>
            ) : null}
            {showingAlreadyConnectedRecovery ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                Wallet already connected. Restoring your session now...
              </div>
            ) : null}
            {redirectReasonMessage ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{redirectReasonMessage}</div>
            ) : null}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Button
                  onClick={() => void handleWalletLogin(METAMASK_CONNECTOR_ID)}
                  disabled={!metaMaskOption || status === 'connecting' || !!connectingWalletId}
                  className="h-auto w-full justify-start gap-3 bg-[#f6851b] py-3 text-white hover:bg-[#e2761b] disabled:bg-[#f6851b]/60"
                >
                  <MetaMaskFoxIcon className="h-7 w-7 shrink-0" />
                  <div className="flex flex-col items-start text-left leading-tight">
                    <span className="text-sm font-semibold">
                      {connectingWalletId === METAMASK_CONNECTOR_ID ? 'Connecting...' : 'Connect MetaMask'}
                    </span>
                    <span className="text-xs font-normal opacity-90">Browser extension &middot; one-click</span>
                  </div>
                </Button>
                {!metaMaskOption ? (
                  <p className="px-1 text-xs text-gray-500">
                    MetaMask extension not detected.{' '}
                    <a
                      href="https://metamask.io/download/"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-gray-700"
                    >
                      Install MetaMask
                    </a>{' '}
                    or use the option below.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  onClick={() => void handleWalletLogin(WALLETCONNECT_CONNECTOR_ID)}
                  disabled={!walletConnectOption || status === 'connecting' || !!connectingWalletId}
                  className="h-auto w-full justify-start gap-3 py-3"
                >
                  <QrCode className="h-7 w-7 shrink-0 text-blue-600" />
                  <div className="flex flex-col items-start text-left leading-tight">
                    <span className="text-sm font-semibold text-gray-900">
                      {connectingWalletId === WALLETCONNECT_CONNECTOR_ID
                        ? 'Opening...'
                        : 'Scan QR or use Mobile MetaMask'}
                    </span>
                    <span className="text-xs font-normal text-gray-500">
                      WalletConnect &middot; phone, tablet, or other wallet apps
                    </span>
                  </div>
                </Button>
                {walletConnectOption ? (
                  <p className="inline-flex items-center gap-1 px-1 text-xs text-amber-700">
                    <Smartphone className="h-3.5 w-3.5" />
                    On iOS, tap this and approve in the MetaMask app.
                  </p>
                ) : (
                  <p className="px-1 text-xs text-gray-500">
                    WalletConnect not configured. Set{' '}
                    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">
                      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
                    </code>{' '}
                    to enable QR / mobile sign-in.
                  </p>
                )}
              </div>
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
                Connected wallet is on the wrong chain. Tap WalletConnect and approve the chain switch/add prompt to recover automatically.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-emerald-50 px-4 py-8 text-sm text-gray-600">Loading sign in...</div>}>
      <LoginPageContent />
    </Suspense>
  );
}
