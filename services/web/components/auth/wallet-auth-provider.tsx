'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ManualWalletContext } from '@/lib/manual-wallet';
import { clearManualWalletSession, createAndPersistManualWalletSession, restoreManualWalletSession } from '@/lib/manual-wallet';
import { assignMyWalletRole, resolveWalletRoleContext } from '@/lib/chainproof-auth';
import type { AppRole } from '@/lib/wallet-auth';
import { configuredChainId } from '@/lib/wallet-auth';

type WalletAuthStatus =
  | 'idle'
  | 'disconnected'
  | 'connecting'
  | 'wrong_chain'
  | 'unassigned_role'
  | 'connected'
  | 'error';

type WalletAuthContextValue = {
  status: WalletAuthStatus;
  account: string | null;
  chainId: number | null;
  role: AppRole;
  owner: string | null;
  contractAddress: string | null;
  error: string | null;
  isConnected: boolean;
  connectWallet: (privateKey: string) => Promise<void>;
  disconnectWallet: () => void;
  refreshWalletState: () => Promise<void>;
  assignMyRole: (role: Exclude<AppRole, 'none'>) => Promise<void>;
};

const WalletAuthContext = createContext<WalletAuthContextValue | undefined>(undefined);

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletAuthStatus>('idle');
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [role, setRole] = useState<AppRole>('none');
  const [owner, setOwner] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hydrateAccountState = useCallback(
    async (session: ManualWalletContext) => {
      setAccount(session.address);
      const detectedChainId = session.chainId;
      setChainId(detectedChainId);

      if (Number.isFinite(configuredChainId) && configuredChainId > 0 && detectedChainId !== configuredChainId) {
        setRole('none');
        setOwner(null);
        setContractAddress(null);
        setStatus('wrong_chain');
        return;
      }

      const context = await resolveWalletRoleContext({
        provider: session.provider,
        account: session.address,
        signer: session.wallet,
      });
      setRole(context.role);
      setOwner(context.owner);
      setContractAddress(context.contractAddress);
      if (context.role === 'none') {
        setStatus('unassigned_role');
      } else {
        setStatus('connected');
      }
    },
    []
  );

  const refreshWalletState = useCallback(async () => {
    try {
      setError(null);
      const session = await restoreManualWalletSession();
      if (!session) {
        setStatus('disconnected');
        setAccount(null);
        setChainId(null);
        setRole('none');
        setOwner(null);
        setContractAddress(null);
        return;
      }
      await hydrateAccountState(session);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to read wallet state.');
    }
  }, [hydrateAccountState]);

  const connectWallet = useCallback(async (privateKey: string) => {
    try {
      setStatus('connecting');
      setError(null);
      const session = await createAndPersistManualWalletSession(privateKey);
      await hydrateAccountState(session);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Manual wallet sign-in failed.');
    }
  }, [hydrateAccountState]);

  const disconnectWallet = useCallback(() => {
    clearManualWalletSession();
    setStatus('disconnected');
    setAccount(null);
    setChainId(null);
    setRole('none');
    setOwner(null);
    setContractAddress(null);
    setError(null);
  }, []);

  const assignMyRole = useCallback(
    async (targetRole: Exclude<AppRole, 'none'>) => {
      const session = await restoreManualWalletSession();
      if (!session) {
        setStatus('disconnected');
        setError('No active wallet session. Sign in with a private key first.');
        return;
      }
      try {
        setError(null);
        await assignMyWalletRole(targetRole, {
          provider: session.provider,
          account: session.address,
          signer: session.wallet,
        });
        await refreshWalletState();
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Role assignment failed.');
      }
    },
    [refreshWalletState]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshWalletState();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshWalletState]);

  const value = useMemo<WalletAuthContextValue>(
    () => ({
      status,
      account,
      chainId,
      role,
      owner,
      contractAddress,
      error,
      isConnected: !!account,
      connectWallet,
      disconnectWallet,
      refreshWalletState,
      assignMyRole,
    }),
    [
      status,
      account,
      chainId,
      role,
      owner,
      contractAddress,
      error,
      connectWallet,
      disconnectWallet,
      refreshWalletState,
      assignMyRole,
    ]
  );

  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>;
}

export function useWalletAuth() {
  const context = useContext(WalletAuthContext);
  if (!context) {
    throw new Error('useWalletAuth must be used within WalletAuthProvider.');
  }
  return context;
}
