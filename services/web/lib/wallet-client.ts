'use client';

import { createConfig, http } from 'wagmi';
import { walletConnect } from 'wagmi/connectors';
import type { Chain } from 'viem';

const configuredRpcUrl = process.env.NEXT_PUBLIC_CHAIN_RPC_URL || 'http://127.0.0.1:8545';
const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '1337');
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

export const chainproofChain: Chain = {
  id: configuredChainId,
  name: `ChainProof Local (${configuredChainId})`,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [configuredRpcUrl] },
    public: { http: [configuredRpcUrl] },
  },
};

// EIP-6963 (multiInjectedProviderDiscovery below) auto-registers the MetaMask
// extension as `io.metamask` when installed; we deliberately do NOT add a
// generic `injected()` connector so the UI only ever offers two paths:
// MetaMask extension or WalletConnect (QR / mobile MetaMask).
const connectors = walletConnectProjectId
  ? [
      walletConnect({
        projectId: walletConnectProjectId,
        showQrModal: true,
        metadata: {
          name: 'ChainProof',
          description: 'Supply-chain traceability wallet login',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://chainproof.local',
          icons: ['https://avatars.githubusercontent.com/u/37784886'],
        },
      }),
    ]
  : [];

export const wagmiConfig = createConfig({
  chains: [chainproofChain],
  connectors,
  transports: {
    [chainproofChain.id]: http(configuredRpcUrl),
  },
  multiInjectedProviderDiscovery: true,
  ssr: true,
});
