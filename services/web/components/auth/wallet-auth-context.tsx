'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Account, Chain, Client, Transport } from 'viem';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import type { Eip1193Provider } from 'ethers';
import { useAccount, useConnect, useConnectorClient, useDisconnect, useReconnect } from 'wagmi';
import type { Connector } from 'wagmi';
import { assignMyWalletRole, resolveWalletRoleContext } from '@/lib/chainproof-auth';
import type { AppRole } from '@/lib/wallet-auth';
import { configuredChainId } from '@/lib/wallet-auth';
import { chainproofChain } from '@/lib/wallet-client';
import { setActiveWalletSession } from '@/lib/active-wallet-session';

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

type EventedEip1193Provider = Eip1193Provider & {
  request?: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  providers?: EventedEip1193Provider[];
};

type RuntimeWalletSession = {
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  address: string;
  chainId: number;
};

export type WriteSession = {
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  address: string;
  chainId: number;
  connectorId: string | null;
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
  connectWallet: () => Promise<void>;
  connectWalletWith: (connectorId: string) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  refreshWalletState: () => Promise<void>;
  syncMobileWalletAccount: () => Promise<void>;
  assignMyRole: (role: Exclude<AppRole, 'none'>) => Promise<void>;
  getWriteSession: () => Promise<WriteSession>;
  wakeWalletApp: (connectorId?: string | null) => void;
};

const WalletAuthContext = createContext<WalletAuthContextValue | undefined>(undefined);

function normalizeAddress(address: string | null | undefined) {
  return (address || '').toLowerCase();
}

function parseChainIdValue(chainIdValue: unknown): number | null {
  if (typeof chainIdValue === 'number' && Number.isFinite(chainIdValue)) {
    return chainIdValue;
  }
  if (typeof chainIdValue === 'string' && chainIdValue.length > 0) {
    const parsed = chainIdValue.startsWith('0x')
      ? Number.parseInt(chainIdValue, 16)
      : Number.parseInt(chainIdValue, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isDesktopWalletSyncTarget() {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const hasTouch = navigator.maxTouchPoints > 1;
  return !isMobileUa && !hasTouch;
}

function isMobileWalletSyncTarget() {
  return !isDesktopWalletSyncTarget();
}

function toHexChainId(chainId: number) {
  return `0x${chainId.toString(16)}`;
}

async function readPassiveProviderSnapshot(provider: EventedEip1193Provider | null | undefined) {
  if (!provider?.request) {
    return null;
  }
  try {
    const [accountsValue, chainIdValue] = await Promise.all([
      provider.request({ method: 'eth_accounts' }),
      provider.request({ method: 'eth_chainId' }),
    ]);

    const accounts = Array.isArray(accountsValue) ? accountsValue : [];
    const firstAccount = typeof accounts[0] === 'string' ? accounts[0] : null;
    return {
      address: firstAccount,
      chainId: parseChainIdValue(chainIdValue),
    };
  } catch {
    return null;
  }
}

async function ensureConfiguredWalletChain(connector: Connector) {
  if (!Number.isFinite(configuredChainId) || configuredChainId <= 0) {
    return;
  }

  const connectorProvider = (await connector.getProvider()) as EventedEip1193Provider | undefined;
  if (!connectorProvider?.request) {
    return;
  }

  const snapshot = await readPassiveProviderSnapshot(connectorProvider);
  if (snapshot?.chainId === configuredChainId) {
    return;
  }

  const targetHexChainId = toHexChainId(configuredChainId);
  try {
    await connectorProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetHexChainId }],
    });
  } catch (switchError) {
    const errorCode = Number((switchError as { code?: number } | undefined)?.code ?? 0);
    if (errorCode !== 4902) {
      throw switchError;
    }

    await connectorProvider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: targetHexChainId,
        chainName: chainproofChain.name,
        nativeCurrency: chainproofChain.nativeCurrency,
        rpcUrls: chainproofChain.rpcUrls.default.http,
      }],
    });

    await connectorProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetHexChainId }],
    });
  }
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

type WalletConnectLikeProvider = EventedEip1193Provider & {
  session?: {
    expiry?: number;
    peer?: {
      metadata?: {
        redirect?: {
          native?: string;
          universal?: string;
        };
      };
    };
  };
};

function readWalletConnectRedirect(provider: WalletConnectLikeProvider | null | undefined): string | null {
  const native = provider?.session?.peer?.metadata?.redirect?.native;
  if (typeof native === 'string' && native.length > 0) {
    return native;
  }
  return null;
}

function isWalletConnectSessionAlive(provider: WalletConnectLikeProvider | null | undefined): boolean {
  if (!provider) return false;
  const session = provider.session;
  if (!session) return false;
  if (typeof session.expiry === 'number') {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (session.expiry <= nowSeconds) {
      return false;
    }
  }
  return true;
}

function openMetaMaskDeepLink(redirectNative: string | null) {
  if (typeof window === 'undefined') return;
  const target = redirectNative || 'metamask://';
  try {
    // iOS can re-trigger protocol handoff prompts on tab return when we assign
    // to location.href. window.open(..., '_self') behaves like a one-shot jump.
    window.open(target, '_self', 'noreferrer noopener');
  } catch {
    // best effort
  }
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
  const signer = new JsonRpcSigner(provider, address);
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
  const lastForegroundRefreshRef = useRef<number>(0);
  // Set during disconnectWallet so the auto-rehydrate paths (refreshWalletState
  // and the auto-reconnect effect) don't undo our cleared state while wagmi is
  // still propagating the disconnect through useAccount / useConnectorClient.
  const disconnectInProgressRef = useRef(false);
  // Auto-reconnect is meant to fire only on initial mount; this ref keeps it
  // from re-firing every time refreshWalletState's identity changes.
  const didTryInitialReconnectRef = useRef(false);

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

  const resolveObservedProviders = useCallback(async () => {
    const providers: EventedEip1193Provider[] = [];
    if (activeConnector) {
      try {
        const connectorProvider = (await activeConnector.getProvider()) as EventedEip1193Provider | undefined;
        if (connectorProvider) {
          providers.push(connectorProvider);
        }
      } catch {
        // best effort
      }
    }

    if (typeof window !== 'undefined') {
      const windowEthereum = (window as Window & { ethereum?: EventedEip1193Provider }).ethereum;
      if (windowEthereum?.providers?.length) {
        for (const candidate of windowEthereum.providers) {
          if (candidate) {
            providers.push(candidate);
          }
        }
      }
      if (windowEthereum) {
        providers.push(windowEthereum);
      }
    }

    const deduped: EventedEip1193Provider[] = [];
    const seen = new Set<EventedEip1193Provider>();
    for (const provider of providers) {
      if (seen.has(provider)) continue;
      seen.add(provider);
      deduped.push(provider);
    }
    return deduped;
  }, [activeConnector]);

  const hydrateAccountState = useCallback(
    async (session: {
      provider: RuntimeWalletSession['provider'];
      signer: RuntimeWalletSession['signer'];
      address: string;
      chainId: number;
      connectorId: string | null;
    }) => {
      const settledChainId = session.chainId;

      setAccount(session.address);
      setChainId(settledChainId);
      setActiveWalletSession({
        provider: session.provider,
        signer: session.signer,
        address: session.address,
        chainId: settledChainId,
        connectorId: session.connectorId,
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
    []
  );

  const refreshWalletState = useCallback(async () => {
    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current;
      return;
    }
    const task = (async () => {
      try {
        setError(null);

        if (disconnectInProgressRef.current) {
          setActiveWalletSession(null);
          clearAuthState();
          return;
        }

        let passiveSnapshot: { address: string | null; chainId: number | null } | null = null;
        if (activeConnector) {
          try {
            const connectorProvider = (await activeConnector.getProvider()) as EventedEip1193Provider | undefined;
            passiveSnapshot = await readPassiveProviderSnapshot(connectorProvider);
          } catch {
            passiveSnapshot = null;
          }
        }

        const effectiveConnectedAddress = passiveSnapshot?.address ?? connectedAddress ?? null;
        const effectiveChainId = passiveSnapshot?.chainId ?? null;
        const runtimeAddress = effectiveConnectedAddress ?? connectedAddress ?? null;

        if (isConnected || effectiveConnectedAddress) {
          const normalizedConnectedAddress = normalizeAddress(effectiveConnectedAddress);
          const connectorClientAddress = normalizeAddress(connectorClient?.account?.address);
          const connectorClientMatches = Boolean(
            connectorClient && connectorClientAddress && connectorClientAddress === normalizedConnectedAddress
          );
          const useConnectorClientRuntime = connectorClientMatches && Boolean(connectorClient);

          if (connectorClient && !connectorClientMatches) {
            // Avoid stale signer usage during wallet account switch races.
            setActiveWalletSession(null);
          }

          const runtime = useConnectorClientRuntime && connectorClient
            ? walletClientToRuntimeSession(connectorClient)
            : activeConnector && runtimeAddress
              ? await runtimeSessionFromConnector(activeConnector, runtimeAddress)
              : null;
          if (!runtime) {
            setStatus('error');
            setError('Wallet connected, but signer session is unavailable. Please reconnect.');
            setAccount(effectiveConnectedAddress);
            return;
          }
          const settledAddress = useConnectorClientRuntime
            ? runtime.address
            : (effectiveConnectedAddress ?? runtime.address);
          const settledChainId = useConnectorClientRuntime
            ? runtime.chainId
            : (effectiveChainId ?? runtime.chainId);
          await hydrateAccountState({
            ...runtime,
            address: settledAddress,
            chainId: settledChainId,
            connectorId: activeConnector?.id ?? null,
          });
          return;
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
      const connectArgs = Number.isFinite(configuredChainId) && configuredChainId > 0
        ? { connector, chainId: configuredChainId }
        : { connector };

      const disconnectAndClearSession = async () => {
        try {
          await disconnectAsync();
        } catch {
          // Ignore disconnect failures; we still clear local signer state.
        }
        setActiveWalletSession(null);
      };

      const handoffIfDifferentConnector = async () => {
        if (activeConnector && activeConnector.id !== connector.id) {
          await disconnectAndClearSession();
        }
      };

      const refreshFromTappedConnector = async () => {
        try {
          const connectorProvider = (await connector.getProvider()) as EventedEip1193Provider | undefined;
          const snapshot = await readPassiveProviderSnapshot(connectorProvider);
          if (!snapshot?.address) {
            await refreshWalletState();
            return;
          }
          const runtime = await runtimeSessionFromConnector(connector, snapshot.address);
          if (!runtime) {
            await refreshWalletState();
            return;
          }
          await hydrateAccountState({
            ...runtime,
            address: snapshot.address ?? runtime.address,
            chainId: snapshot.chainId ?? runtime.chainId,
            connectorId: connector.id,
          });
        } catch {
          await refreshWalletState();
        }
      };

      try {
        await handoffIfDifferentConnector();
        await connectAsync(connectArgs);
        await ensureConfiguredWalletChain(connector);
        await refreshFromTappedConnector();
      } catch (err) {
        if (isRecoverableConnectorError(err)) {
          // Account-switch races can leave a stale connector client; reconnect cleanly.
          await disconnectAndClearSession();
          try {
            await connectAsync(connectArgs);
          } catch (retryErr) {
            if (!isRecoverableConnectorError(retryErr)) {
              throw retryErr;
            }
          }
          await ensureConfiguredWalletChain(connector);
          await refreshFromTappedConnector();
          return;
        }
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Wallet sign-in failed.');
        throw err;
      }
    },
    [activeConnector, connectAsync, disconnectAsync, hydrateAccountState, refreshWalletState]
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
    async () => {
      try {
        setStatus('connecting');
        setError(null);

        const preferred =
          connectors.find((connector) => connector.id === 'io.metamask') ??
          connectors.find((connector) => connector.id === 'walletConnect') ??
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
    [connectWithConnector, connectors]
  );

  const disconnectWallet = useCallback(async () => {
    disconnectInProgressRef.current = true;
    try {
      await disconnectAsync();
    } catch {
      // Ignore disconnect errors; auth state is cleared below either way.
    }
    setActiveWalletSession(null);
    setError(null);
    clearAuthState();
    // Hold the guard long enough for wagmi to finish propagating disconnect
    // through useAccount / useConnectorClient and persist its "user
    // disconnected" intent. Anything shorter and the auto-rehydrate paths can
    // still race us by reading eth_accounts off the still-attached wallet
    // provider and restoring the account we just cleared.
    window.setTimeout(() => {
      disconnectInProgressRef.current = false;
    }, 1000);
  }, [clearAuthState, disconnectAsync]);

  const syncMobileWalletAccount = useCallback(async () => {
    setError(null);
    await refreshWalletState();
  }, [refreshWalletState]);

  const getWriteSession = useCallback(async (): Promise<WriteSession> => {
    if (!activeConnector) {
      throw new Error('No active wallet connector. Reconnect to continue.');
    }

    const rawProvider = (await activeConnector.getProvider()) as WalletConnectLikeProvider | undefined;
    if (!rawProvider?.request) {
      throw new Error('Wallet provider is unavailable. Reconnect to continue.');
    }

    if (activeConnector.id === 'walletConnect') {
      if (!isWalletConnectSessionAlive(rawProvider)) {
        await disconnectAsync().catch(() => undefined);
        setActiveWalletSession(null);
        clearAuthState();
        throw new Error('Wallet session expired. Reconnect to continue.');
      }
      try {
        const accountsValue = await rawProvider.request({ method: 'eth_accounts' });
        const accounts = Array.isArray(accountsValue) ? accountsValue : [];
        if (accounts.length === 0) {
          await disconnectAsync().catch(() => undefined);
          setActiveWalletSession(null);
          clearAuthState();
          throw new Error('Wallet session expired. Reconnect to continue.');
        }
      } catch (err) {
        if (err instanceof Error && /Wallet session expired/.test(err.message)) {
          throw err;
        }
        // Probe failure is non-fatal here; signer creation may still succeed.
      }
    }

    const passiveSnapshot = await readPassiveProviderSnapshot(rawProvider);
    const address = passiveSnapshot?.address ?? connectedAddress ?? null;
    if (!address) {
      throw new Error('Wallet account is unavailable. Reconnect to continue.');
    }

    const provider = new BrowserProvider(rawProvider as Eip1193Provider);
    const network = await provider.getNetwork();
    const chainIdValue = Number(network.chainId);

    if (Number.isFinite(configuredChainId) && configuredChainId > 0 && chainIdValue !== configuredChainId) {
      throw new Error(`Wrong RPC network. Configure chain ${configuredChainId} and retry.`);
    }

    const signer = new JsonRpcSigner(provider, address);
    const connectorId = activeConnector.id;

    setActiveWalletSession({
      provider,
      signer,
      address,
      chainId: chainIdValue,
      connectorId,
    });

    return {
      provider,
      signer,
      address,
      chainId: chainIdValue,
      connectorId,
    };
  }, [activeConnector, clearAuthState, connectedAddress, disconnectAsync]);

  const wakeWalletApp = useCallback(
    (overrideConnectorId?: string | null) => {
      const targetConnectorId = overrideConnectorId ?? activeConnector?.id ?? null;
      if (targetConnectorId !== 'walletConnect') return;
      if (typeof window === 'undefined') return;
      void (async () => {
        let redirectNative: string | null = null;
        try {
          if (activeConnector) {
            const rawProvider = (await activeConnector.getProvider()) as WalletConnectLikeProvider | undefined;
            redirectNative = readWalletConnectRedirect(rawProvider);
          }
        } catch {
          redirectNative = null;
        }
        openMetaMaskDeepLink(redirectNative);
      })();
    },
    [activeConnector]
  );

  const assignMyRole = useCallback(
    async (targetRole: Exclude<AppRole, 'none'>) => {
      try {
        setError(null);
        const session = await getWriteSession();
        wakeWalletApp(session.connectorId);

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
    [getWriteSession, refreshWalletState, wakeWalletApp]
  );

  useEffect(() => {
    if (didTryInitialReconnectRef.current) return;
    if (disconnectInProgressRef.current) return;
    didTryInitialReconnectRef.current = true;
    void reconnectAsync().finally(() => {
      void refreshWalletState();
    });
  }, [reconnectAsync, refreshWalletState]);

  useEffect(() => {
    void refreshWalletState();
  }, [refreshWalletState, connectedAddress, connectorClient, activeConnector]);

  useEffect(() => {
    if (!isMobileWalletSyncTarget()) return;
    const FOREGROUND_REFRESH_DEBOUNCE_MS = 700;

    const maybeRefresh = () => {
      const now = Date.now();
      if (now - lastForegroundRefreshRef.current < FOREGROUND_REFRESH_DEBOUNCE_MS) return;
      lastForegroundRefreshRef.current = now;
      void refreshWalletState();
    };

    const onPageShow = () => {
      maybeRefresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        maybeRefresh();
      }
    };

    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshWalletState]);

  useEffect(() => {
    if (!isDesktopWalletSyncTarget()) {
      return;
    }

    const FOREGROUND_REFRESH_DEBOUNCE_MS = 700;
    const VISIBLE_TAB_SYNC_INTERVAL_MS = 1500;

    const maybeRefreshOnForeground = async () => {
      const now = Date.now();
      if (now - lastForegroundRefreshRef.current < FOREGROUND_REFRESH_DEBOUNCE_MS) {
        return;
      }
      lastForegroundRefreshRef.current = now;

      const observedProviders = await resolveObservedProviders();
      let requiresRefresh = observedProviders.length === 0;
      for (const provider of observedProviders) {
        const snapshot = await readPassiveProviderSnapshot(provider);
        if (!snapshot) {
          continue;
        }
        const currentAddress = normalizeAddress(connectedAddress);
        const snapshotAddress = normalizeAddress(snapshot.address);
        const chainMatches = snapshot.chainId !== null && chainId !== null
          ? snapshot.chainId === chainId
          : snapshot.chainId === chainId;
        const addressMatches = currentAddress === snapshotAddress;
        if (!addressMatches || !chainMatches) {
          requiresRefresh = true;
          break;
        }
        requiresRefresh = false;
      }

      if (requiresRefresh) {
        await refreshWalletState();
      }
    };

    const onFocus = () => {
      void maybeRefreshOnForeground();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void maybeRefreshOnForeground();
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void maybeRefreshOnForeground();
    }, VISIBLE_TAB_SYNC_INTERVAL_MS);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [chainId, connectedAddress, refreshWalletState, resolveObservedProviders]);

  useEffect(() => {
    if (!isDesktopWalletSyncTarget()) {
      return;
    }
    let disposed = false;
    const removers: Array<() => void> = [];

    const attachListeners = async () => {
      if (!activeConnector && typeof window === 'undefined') return;
      try {
        const observedProviders = await resolveObservedProviders();
        if (disposed || observedProviders.length === 0) return;

        for (const provider of observedProviders) {
          const onAccountsChanged = () => {
            void refreshWalletState();
          };
          const onChainChanged = () => {
            void refreshWalletState();
          };
          const onDisconnect = () => {
            void refreshWalletState();
          };

          provider.on?.('accountsChanged', onAccountsChanged);
          provider.on?.('chainChanged', onChainChanged);
          provider.on?.('disconnect', onDisconnect);

          removers.push(() => provider.removeListener?.('accountsChanged', onAccountsChanged));
          removers.push(() => provider.removeListener?.('chainChanged', onChainChanged));
          removers.push(() => provider.removeListener?.('disconnect', onDisconnect));
        }
      } catch {
        // If listener wiring fails, polling/refresh paths still cover state sync.
      }
    };

    void attachListeners();

    return () => {
      disposed = true;
      for (const remove of removers) {
        remove();
      }
    };
  }, [activeConnector, refreshWalletState, resolveObservedProviders]);

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
      connectWallet,
      connectWalletWith,
      disconnectWallet,
      refreshWalletState,
      syncMobileWalletAccount,
      assignMyRole,
      getWriteSession,
      wakeWalletApp,
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
      syncMobileWalletAccount,
      assignMyRole,
      getWriteSession,
      wakeWalletApp,
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
