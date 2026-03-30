'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Account, Chain, Client, Transport } from 'viem';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import type { Eip1193Provider } from 'ethers';
import { useAccount, useConnect, useConnectorClient, useDisconnect, useReconnect } from 'wagmi';
import type { Connector } from 'wagmi';
import type { ManualWalletContext } from '@/lib/manual-wallet';
import { clearManualWalletSession, createAndPersistManualWalletSession, restoreManualWalletSession } from '@/lib/manual-wallet';
import { assignMyWalletRole, resolveWalletRoleContext } from '@/lib/chainproof-auth';
import type { AppRole } from '@/lib/wallet-auth';
import { configuredChainId } from '@/lib/wallet-auth';
import { enableManualWalletFallback } from '@/lib/wallet-client';
import { getActiveWalletSession, setActiveWalletSession } from '@/lib/active-wallet-session';

type WalletAuthStatus =
  | 'idle'
  | 'disconnected'
  | 'connecting'
  | 'wrong_chain'
  | 'unassigned_role'
  | 'connected'
  | 'error';

type WalletOption = {
  id: string;
  name: string;
};

type RuntimeWalletSession = {
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  address: string;
  chainId: number;
};

type WalletAuthContextValue = {
  status: WalletAuthStatus;
  account: string | null;
  chainId: number | null;
  role: AppRole;
  owner: string | null;
  contractAddress: string | null;
  error: string | null;
  isConnected: boolean;
  walletOptions: WalletOption[];
  manualWalletEnabled: boolean;
  connectWallet: (privateKey?: string) => Promise<void>;
  connectWalletWith: (connectorId: string) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  refreshWalletState: () => Promise<void>;
  assignMyRole: (role: Exclude<AppRole, 'none'>) => Promise<void>;
};

const WalletAuthContext = createContext<WalletAuthContextValue | undefined>(undefined);

function normalizeAddress(address: string | null | undefined) {
  return (address || '').toLowerCase();
}

function isAlreadyConnectedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.toLowerCase().includes('already connected');
}

function isRecoverableConnectorError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    message.includes('already connected') ||
    message.includes('connector already connected') ||
    message.includes('pending') ||
    message.includes('resource unavailable')
  );
}

function isUnrecognizedChainError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    message.includes('4902') ||
    message.includes('unrecognized chain') ||
    message.includes('unknown chain') ||
    message.includes('wallet_addethereumchain')
  );
}

function toHexChainId(chainId: number) {
  return `0x${Math.max(0, chainId).toString(16)}`;
}

function walletClientToRuntimeSession(client: Client<Transport, Chain, Account>): RuntimeWalletSession {
  const { account, chain, transport } = client;
  const provider = new BrowserProvider(transport, {
    chainId: chain.id,
    name: chain.name,
  });
  const signer = new JsonRpcSigner(provider, account.address);
  return {
    provider,
    signer,
    address: account.address,
    chainId: chain.id,
  };
}

async function runtimeSessionFromConnector(
  connector: Connector,
  address: string
): Promise<RuntimeWalletSession | null> {
  const connectorProvider = await connector.getProvider();
  if (!connectorProvider) {
    return null;
  }
  const provider = new BrowserProvider(connectorProvider as Eip1193Provider);
  const signer = await provider.getSigner(address);
  const network = await provider.getNetwork();
  return {
    provider,
    signer,
    address,
    chainId: Number(network.chainId),
  };
}

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletAuthStatus>('idle');
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [role, setRole] = useState<AppRole>('none');
  const [owner, setOwner] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const { address: connectedAddress, connector: activeConnector, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { data: connectorClient } = useConnectorClient();
  const { reconnectAsync } = useReconnect();

  const walletOptions = useMemo<WalletOption[]>(
    () => connectors.map((connector) => ({ id: connector.id, name: connector.name })),
    [connectors]
  );

  const clearAuthState = useCallback(() => {
    setStatus('disconnected');
    setAccount(null);
    setChainId(null);
    setRole('none');
    setOwner(null);
    setContractAddress(null);
  }, []);

  const ensureConfiguredWalletChain = useCallback(
    async (provider: BrowserProvider) => {
      if (!Number.isFinite(configuredChainId) || configuredChainId <= 0) return;
      const currentNetwork = await provider.getNetwork();
      const currentChainId = Number(currentNetwork.chainId);
      if (currentChainId === configuredChainId) return;

      const desiredChainHex = toHexChainId(configuredChainId);
      try {
        await provider.send('wallet_switchEthereumChain', [{ chainId: desiredChainHex }]);
      } catch (switchError) {
        if (isUnrecognizedChainError(switchError)) {
          const rpcUrl = process.env.NEXT_PUBLIC_CHAINPROOF_RPC_URL || 'http://127.0.0.1:8545';
          await provider.send('wallet_addEthereumChain', [
            {
              chainId: desiredChainHex,
              chainName: `ChainProof Local (${configuredChainId})`,
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: [rpcUrl],
            },
          ]);
          await provider.send('wallet_switchEthereumChain', [{ chainId: desiredChainHex }]);
        } else {
          throw switchError;
        }
      }
    },
    []
  );

  const hydrateAccountState = useCallback(
    async (session: {
      provider: ManualWalletContext['provider'] | RuntimeWalletSession['provider'];
      signer: ManualWalletContext['wallet'] | RuntimeWalletSession['signer'];
      address: string;
      chainId: number;
      source: 'wallet' | 'manual';
    }) => {
      let settledChainId = session.chainId;
      if (session.source === 'wallet') {
        try {
          await ensureConfiguredWalletChain(session.provider as BrowserProvider);
          const refreshedNetwork = await (session.provider as BrowserProvider).getNetwork();
          settledChainId = Number(refreshedNetwork.chainId);
        } catch (chainError) {
          settledChainId = session.chainId;
          setError(
            chainError instanceof Error
              ? chainError.message
              : `Unable to switch wallet to required chain ${configuredChainId}.`
          );
        }
      }

      setAccount(session.address);
      setChainId(settledChainId);
      setActiveWalletSession({
        provider: session.provider,
        signer: session.signer,
        address: session.address,
        chainId: settledChainId,
        source: session.source,
      });

      if (Number.isFinite(configuredChainId) && configuredChainId > 0 && settledChainId !== configuredChainId) {
        setRole('none');
        setOwner(null);
        setContractAddress(null);
        setStatus('wrong_chain');
        return;
      }

      const context = await resolveWalletRoleContext({
        provider: session.provider,
        account: session.address,
        signer: session.signer,
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
    [ensureConfiguredWalletChain]
  );

  const refreshWalletState = useCallback(async () => {
    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current;
      return;
    }
    const task = (async () => {
      try {
        setError(null);

        if (isConnected && connectedAddress) {
          const normalizedConnectedAddress = normalizeAddress(connectedAddress);
          const connectorClientAddress = normalizeAddress(connectorClient?.account?.address);
          const connectorClientMatches = Boolean(
            connectorClient && connectorClientAddress && connectorClientAddress === normalizedConnectedAddress
          );

          if (connectorClient && !connectorClientMatches) {
            // Avoid stale signer usage during wallet account switch races.
            setActiveWalletSession(null);
          }

          const runtime = connectorClientMatches && connectorClient
            ? walletClientToRuntimeSession(connectorClient)
            : activeConnector
              ? await runtimeSessionFromConnector(activeConnector, connectedAddress)
              : null;
          if (!runtime) {
            setStatus('error');
            setError('Wallet connected, but signer session is unavailable. Please reconnect.');
            setAccount(connectedAddress);
            return;
          }
          await hydrateAccountState({ ...runtime, source: 'wallet' });
          return;
        }

        if (enableManualWalletFallback) {
          const manualSession = await restoreManualWalletSession();
          if (manualSession) {
            await hydrateAccountState({
              provider: manualSession.provider,
              signer: manualSession.wallet,
              address: manualSession.address,
              chainId: manualSession.chainId,
              source: 'manual',
            });
            return;
          }
        }

        setActiveWalletSession(null);
        clearAuthState();
      } catch (err) {
        setActiveWalletSession(null);
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to read wallet state.');
      }
    })();
    refreshInFlightRef.current = task;
    try {
      await task;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, [activeConnector, clearAuthState, connectedAddress, connectorClient, hydrateAccountState, isConnected]);

  const connectWithConnector = useCallback(
    async (connector: Connector) => {
      setStatus('connecting');
      setError(null);
      try {
        await connectAsync({ connector });
      } catch (err) {
        if (isRecoverableConnectorError(err)) {
          // iOS app-switch can report recoverable connector races.
          await refreshWalletState();
          return;
        }
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Wallet sign-in failed.');
        throw err;
      }
    },
    [connectAsync, refreshWalletState]
  );

  const connectWalletWith = useCallback(
    async (connectorId: string) => {
      const connector = connectors.find((candidate) => candidate.id === connectorId);
      if (!connector) {
        throw new Error(`Wallet connector "${connectorId}" is unavailable.`);
      }
      await connectWithConnector(connector);
    },
    [connectWithConnector, connectors]
  );

  const connectWallet = useCallback(
    async (privateKey?: string) => {
      try {
        setStatus('connecting');
        setError(null);

        if (enableManualWalletFallback && privateKey && privateKey.trim()) {
          const session = await createAndPersistManualWalletSession(privateKey);
          await hydrateAccountState({
            provider: session.provider,
            signer: session.wallet,
            address: session.address,
            chainId: session.chainId,
            source: 'manual',
          });
          return;
        }

        const preferred =
          connectors.find((connector) => connector.id === 'io.metamask') ??
          connectors.find((connector) => connector.id === 'injected') ??
          connectors[0];
        if (!preferred) {
          throw new Error('No wallet connector is available.');
        }
        await connectWithConnector(preferred);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Wallet sign-in failed.');
      }
    },
    [connectWithConnector, connectors, hydrateAccountState]
  );

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnectAsync();
    } catch {
      // keep cleanup resilient
    }
    clearManualWalletSession();
    setActiveWalletSession(null);
    setError(null);
    clearAuthState();
  }, [clearAuthState, disconnectAsync]);

  const assignMyRole = useCallback(
    async (targetRole: Exclude<AppRole, 'none'>) => {
      try {
        setError(null);
        let session = getActiveWalletSession();
        if (!session) {
          await refreshWalletState();
          session = getActiveWalletSession();
        }
        if (!session) {
          setStatus('disconnected');
          setError('No active wallet session. Sign in first.');
          return;
        }

        await assignMyWalletRole(targetRole, {
          provider: session.provider,
          account: session.address,
          signer: session.signer,
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
    void reconnectAsync().finally(() => {
      void refreshWalletState();
    });
  }, [reconnectAsync, refreshWalletState]);

  useEffect(() => {
    void refreshWalletState();
  }, [refreshWalletState, connectedAddress, connectorClient, activeConnector]);

  useEffect(() => {
    const onFocus = () => {
      void refreshWalletState();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshWalletState();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
      walletOptions,
      manualWalletEnabled: enableManualWalletFallback,
      connectWallet,
      connectWalletWith,
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
      walletOptions,
      connectWallet,
      connectWalletWith,
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
