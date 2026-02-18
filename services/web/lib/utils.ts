import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function generateBatchNumber(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `BATCH-${timestamp}-${random}`.toUpperCase();
}

export function formatBlockchainHash(hash: string | undefined): string {
  if (!hash) return 'N/A';
  return `${hash.substring(0, 8)}...${hash.substring(hash.length - 6)}`;
}
