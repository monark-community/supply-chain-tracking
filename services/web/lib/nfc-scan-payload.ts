'use client';

import { readBatchIdByHardwareId } from './chainproof-read';
import { parseNfcPayloadFromSearchParams as parsePayloadFromParams, type ParsedNfcPayload } from './nfc-payload-contract';

export type ParsedNfcScanPayload = ParsedNfcPayload;

export type ResolvedNfcScanContext = ParsedNfcScanPayload & {
  resolvedBatchId: number | null;
  mappingStatus: 'mapped' | 'unmapped';
  verifiedAt: number;
  replayStatus: 'new' | 'duplicate';
  receiptId: string;
  receivedAt: number;
  signatureScheme: 'hmac-sha256-trunc128' | 'fnv1a64-legacy';
};

type VerifyApiResponse = {
  verified: true;
  replayStatus: 'new' | 'duplicate';
  receiptId: string;
  receivedAt: number;
  signatureScheme: 'hmac-sha256-trunc128' | 'fnv1a64-legacy';
};

async function verifyNfcScanPayload(payload: ParsedNfcScanPayload): Promise<VerifyApiResponse> {
  const response = await fetch('/api/nfc/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = (await response.json().catch(() => ({}))) as Partial<VerifyApiResponse> & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || 'NFC payload verification failed.');
  }

  if (!result.verified || !result.receiptId || !result.replayStatus || !result.signatureScheme) {
    throw new Error('NFC verification service returned an invalid response.');
  }

  return {
    verified: true,
    replayStatus: result.replayStatus,
    receiptId: result.receiptId,
    receivedAt: Number(result.receivedAt || Date.now()),
    signatureScheme: result.signatureScheme,
  };
}

export function parseNfcPayloadFromSearchParams(searchParams: URLSearchParams): ParsedNfcScanPayload {
  return parsePayloadFromParams(searchParams);
}

export async function resolveNfcScanContext(payload: ParsedNfcScanPayload): Promise<ResolvedNfcScanContext> {
  const verification = await verifyNfcScanPayload(payload);
  const resolvedBatchIdRaw = await readBatchIdByHardwareId(payload.hardwareId);
  const resolvedBatchId = resolvedBatchIdRaw > 0 ? resolvedBatchIdRaw : null;
  return {
    ...payload,
    resolvedBatchId,
    mappingStatus: resolvedBatchId ? 'mapped' : 'unmapped',
    verifiedAt: Date.now(),
    replayStatus: verification.replayStatus,
    receiptId: verification.receiptId,
    receivedAt: verification.receivedAt,
    signatureScheme: verification.signatureScheme,
  };
}
