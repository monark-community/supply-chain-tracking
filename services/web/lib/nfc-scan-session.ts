'use client';

import type { ResolvedNfcScanContext } from './nfc-scan-payload';

const PENDING_NFC_SCAN_STORAGE_KEY = 'chainproof.pendingNfcScan.v1';

type StoredPendingScan = ResolvedNfcScanContext & {
  continueTo: string;
};

function canUseWindow() {
  return typeof window !== 'undefined';
}

export function savePendingNfcScan(context: ResolvedNfcScanContext, continueTo: string = '/scanner') {
  if (!canUseWindow()) return;
  const payload: StoredPendingScan = {
    ...context,
    continueTo,
  };
  window.localStorage.setItem(PENDING_NFC_SCAN_STORAGE_KEY, JSON.stringify(payload));
}

export function readPendingNfcScan(): StoredPendingScan | null {
  if (!canUseWindow()) return null;
  const raw = window.localStorage.getItem(PENDING_NFC_SCAN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPendingScan>;
    const parsedRecord = parsed as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.hardwareId || !parsed.sig) return null;

    const version = Number(parsed.version) === 2 ? 2 : 1;
    const common = {
      hardwareId: String(parsed.hardwareId),
      batchIdHint: parsed.batchIdHint ? Number(parsed.batchIdHint) : null,
      tempMax: Number(parsed.tempMax),
      humiMax: Number(parsed.humiMax),
      flag: Number(parsed.flag ?? 0),
      sig: String(parsed.sig),
      resolvedBatchId:
        parsed.resolvedBatchId === null || parsed.resolvedBatchId === undefined
          ? null
          : Number(parsed.resolvedBatchId),
      mappingStatus:
        parsed.mappingStatus === 'mapped' || parsed.mappingStatus === 'unmapped'
          ? parsed.mappingStatus
          : Number(parsed.resolvedBatchId || 0) > 0
            ? 'mapped'
            : 'unmapped',
      verifiedAt: Number(parsed.verifiedAt || Date.now()),
      replayStatus: (parsed.replayStatus === 'duplicate' ? 'duplicate' : 'new') as 'new' | 'duplicate',
      receiptId: String(parsed.receiptId || ''),
      receivedAt: Number(parsed.receivedAt || Date.now()),
      signatureScheme: (parsed.signatureScheme === 'fnv1a64-legacy' ? 'fnv1a64-legacy' : 'hmac-sha256-trunc128') as
        | 'hmac-sha256-trunc128'
        | 'fnv1a64-legacy',
      continueTo: typeof parsed.continueTo === 'string' && parsed.continueTo ? parsed.continueTo : '/scanner',
    };

    if (version === 2) {
      return {
        ...common,
        version: 2 as const,
        bootId: Number(parsedRecord.bootId),
        nfcSeq: Number(parsedRecord.nfcSeq),
        sampleSeq: Number(parsedRecord.sampleSeq),
      };
    }

    return {
      ...common,
      version: 1 as const,
      ts: Number(parsedRecord.ts),
    };
  } catch {
    return null;
  }
}

export function consumePendingNfcScan(): StoredPendingScan | null {
  const pending = readPendingNfcScan();
  if (!canUseWindow()) return pending;
  window.localStorage.removeItem(PENDING_NFC_SCAN_STORAGE_KEY);
  return pending;
}

export function clearPendingNfcScan() {
  if (!canUseWindow()) return;
  window.localStorage.removeItem(PENDING_NFC_SCAN_STORAGE_KEY);
}
