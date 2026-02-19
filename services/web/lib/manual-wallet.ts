'use client';

import { JsonRpcProvider, Wallet } from 'ethers';
import { configuredChainId } from './wallet-auth';

const defaultRpcUrl = process.env.NEXT_PUBLIC_CHAINPROOF_RPC_URL || 'http://127.0.0.1:8545';
const SESSION_STORAGE_KEY = 'chainproof.manualWalletSession.v1';

type StoredManualWalletSession = {
  privateKey: string;
  address: string;
  chainId: number;
  rpcUrl: string;
  updatedAt: number;
};

export type ManualWalletContext = {
  provider: JsonRpcProvider;
  wallet: Wallet;
  address: string;
  chainId: number;
  rpcUrl: string;
};

function assertClient() {
  if (typeof window === 'undefined') {
    throw new Error('Manual wallet session is only available in browser.');
  }
}

function normalizePrivateKey(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Private key is required.');
  }

  const key = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error('Invalid private key format. Expected 32-byte hex key.');
  }
  return key;
}

export function getManualWalletStorageKey() {
  return SESSION_STORAGE_KEY;
}

export function getManualWalletProvider() {
  return new JsonRpcProvider(defaultRpcUrl);
}

export function readStoredManualWalletSession(): StoredManualWalletSession | null {
  assertClient();
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredManualWalletSession>;
    if (!parsed.privateKey || !parsed.address || !parsed.rpcUrl) {
      return null;
    }
    return {
      privateKey: String(parsed.privateKey),
      address: String(parsed.address),
      chainId: Number(parsed.chainId || 0),
      rpcUrl: String(parsed.rpcUrl),
      updatedAt: Number(parsed.updatedAt || Date.now()),
    };
  } catch {
    return null;
  }
}

export function clearManualWalletSession() {
  assertClient();
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function buildContextFromPrivateKey(privateKeyInput: string): Promise<ManualWalletContext> {
  const privateKey = normalizePrivateKey(privateKeyInput);
  const provider = getManualWalletProvider();
  const wallet = new Wallet(privateKey, provider);
  const address = await wallet.getAddress();
  const chainId = Number((await provider.getNetwork()).chainId);

  if (Number.isFinite(configuredChainId) && configuredChainId > 0 && chainId !== configuredChainId) {
    throw new Error(`Wrong RPC network. Configure chain ${configuredChainId} and retry.`);
  }

  return {
    provider,
    wallet,
    address,
    chainId,
    rpcUrl: defaultRpcUrl,
  };
}

export async function createAndPersistManualWalletSession(privateKeyInput: string): Promise<ManualWalletContext> {
  assertClient();
  const context = await buildContextFromPrivateKey(privateKeyInput);
  const payload: StoredManualWalletSession = {
    privateKey: context.wallet.privateKey,
    address: context.address,
    chainId: context.chainId,
    rpcUrl: context.rpcUrl,
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  return context;
}

export async function restoreManualWalletSession(): Promise<ManualWalletContext | null> {
  assertClient();
  const stored = readStoredManualWalletSession();
  if (!stored) return null;

  try {
    return await buildContextFromPrivateKey(stored.privateKey);
  } catch {
    clearManualWalletSession();
    return null;
  }
}
