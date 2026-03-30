import path from 'node:path';
import { promises as fs } from 'node:fs';

export type ReplayStatus = 'new' | 'duplicate';

export type DeviceReplayState = {
  hardwareId: string;
  lastBootId?: number;
  lastNfcSeq?: number;
  lastSampleSeq?: number;
  updatedAtMs: number;
};

export type ScanReceipt = {
  id: string;
  payloadHash: string;
  hardwareId: string;
  version: 1 | 2;
  replayStatus: ReplayStatus;
  receivedAtMs: number;
  details: Record<string, number | string>;
};

type ReplayStore = {
  devices: Record<string, DeviceReplayState>;
  payloadHashes: Record<string, number>;
  receipts: Record<string, ScanReceipt>;
};

const STORE_DIR = path.resolve(process.cwd(), '.runtime');
const STORE_PATH = path.resolve(STORE_DIR, 'nfc-replay-store.json');
const HASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function emptyStore(): ReplayStore {
  return {
    devices: {},
    payloadHashes: {},
    receipts: {},
  };
}

async function ensureStoreDir() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

export async function readReplayStore(): Promise<ReplayStore> {
  await ensureStoreDir();
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ReplayStore>;
    const devices = parsed.devices && typeof parsed.devices === 'object' ? parsed.devices : {};
    const payloadHashes = parsed.payloadHashes && typeof parsed.payloadHashes === 'object' ? parsed.payloadHashes : {};
    const receipts = parsed.receipts && typeof parsed.receipts === 'object' ? parsed.receipts : {};
    return { devices, payloadHashes, receipts };
  } catch {
    return emptyStore();
  }
}

function pruneExpiredHashes(store: ReplayStore, nowMs: number) {
  for (const [hash, seenAt] of Object.entries(store.payloadHashes)) {
    if (!Number.isFinite(seenAt) || nowMs - seenAt > HASH_TTL_MS) {
      delete store.payloadHashes[hash];
    }
  }
}

export async function writeReplayStore(store: ReplayStore) {
  await ensureStoreDir();
  await fs.writeFile(STORE_PATH, JSON.stringify(store), 'utf-8');
}

export async function withReplayStore<T>(fn: (store: ReplayStore) => T | Promise<T>): Promise<T> {
  const store = await readReplayStore();
  pruneExpiredHashes(store, Date.now());
  const result = await fn(store);
  await writeReplayStore(store);
  return result;
}
