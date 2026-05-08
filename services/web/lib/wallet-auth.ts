'use client';

export type AppRole = 'producer' | 'processor' | 'warehouse' | 'transporter' | 'customer' | 'none';

export const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '1337');

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
