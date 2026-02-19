'use client';

export type AppRole = 'producer' | 'processor' | 'warehouse' | 'transporter' | 'customer' | 'none';

export const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAINPROOF_CHAIN_ID || '1337');

export function normalizeChainId(value: string | number | bigint): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  const normalized = value.startsWith('0x') ? parseInt(value, 16) : Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
