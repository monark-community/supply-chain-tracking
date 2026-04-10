'use client';

import type { Provider, Signer } from 'ethers';

export type ActiveWalletSession = {
  provider: Provider;
  signer: Signer;
  address: string;
  chainId: number;
  source: 'wallet' | 'manual';
};

let activeSession: ActiveWalletSession | null = null;

export function setActiveWalletSession(session: ActiveWalletSession | null) {
  activeSession = session;
}

export function getActiveWalletSession(): ActiveWalletSession | null {
  return activeSession;
}
