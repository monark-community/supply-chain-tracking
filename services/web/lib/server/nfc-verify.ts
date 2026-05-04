import crypto from 'node:crypto';

import { canonicalPayload, type ParsedNfcPayload } from '@/lib/nfc-payload-contract';
import { withReplayStore, type ReplayStatus, type ScanReceipt } from './nfc-replay-store';

type VerifyResult = {
  verified: true;
  replayStatus: ReplayStatus;
  receiptId: string;
  receivedAt: number;
  signatureScheme: 'hmac-sha256-trunc128' | 'fnv1a64-legacy';
};

function parseDeviceKeysConfig(): Record<string, string> {
  const raw = process.env.NFC_DEVICE_KEYS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed).filter(([, value]) => typeof value === 'string') as Array<[string, string]>;
    return Object.fromEntries(entries.map(([k, v]) => [k.trim(), v]));
  } catch {
    return {};
  }
}

function getDeviceSecret(hardwareId: string): string {
  const keys = parseDeviceKeysConfig();
  const byDevice = keys[hardwareId];
  if (byDevice) return byDevice;
  return process.env.NFC_DEVICE_DEFAULT_SECRET || 'chainproof-demo-signing-key';
}

function computeHmacSha256Trunc128Hex(canonical: string, key: string): string {
  return crypto.createHmac('sha256', key).update(canonical, 'utf-8').digest('hex').slice(0, 32);
}

function fnv1a64(text: string, seed: bigint): bigint {
  let hash = seed;
  const prime = BigInt('1099511628211');
  const mask = BigInt('18446744073709551615');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i) & 0xff);
    hash = (hash * prime) & mask;
  }
  return hash;
}

function computeLegacyFnvSignature(canonical: string, key: string): string {
  const start = BigInt('1469598103934665603');
  const withKey = fnv1a64(key, start);
  const withSeparator = fnv1a64('|', withKey);
  const finalHash = fnv1a64(canonical, withSeparator);
  return finalHash.toString(16).padStart(16, '0');
}

function computePayloadHash(payload: ParsedNfcPayload): string {
  const canonical = canonicalPayload(payload);
  return crypto.createHash('sha256').update(`${canonical}|${payload.sig}`, 'utf-8').digest('hex');
}

function enforceMonotonicRules(payload: ParsedNfcPayload, previous?: { lastBootId?: number; lastNfcSeq?: number; lastSampleSeq?: number }) {
  if (payload.version !== 2) return;
  if (!previous) return;

  const lastBoot = previous.lastBootId ?? 0;
  const lastNfc = previous.lastNfcSeq ?? 0;
  const lastSample = previous.lastSampleSeq ?? 0;

  if (payload.bootId < lastBoot) {
    throw new Error('NFC payload boot counter regressed.');
  }
  if (payload.bootId === lastBoot) {
    if (payload.nfcSeq < lastNfc) {
      throw new Error('NFC payload sequence regressed.');
    }
    if (payload.nfcSeq === lastNfc && payload.sampleSeq < lastSample) {
      throw new Error('NFC payload sample sequence regressed.');
    }
  }
}

function validateSignature(payload: ParsedNfcPayload): VerifyResult['signatureScheme'] {
  const canonical = canonicalPayload(payload);
  const deviceSecret = getDeviceSecret(payload.hardwareId);
  const expectedHmac = computeHmacSha256Trunc128Hex(canonical, deviceSecret);
  if (expectedHmac === payload.sig) {
    return 'hmac-sha256-trunc128';
  }

  // Migration support for existing v1 tags.
  if (payload.version === 1) {
    const legacy = computeLegacyFnvSignature(canonical, deviceSecret);
    if (legacy === payload.sig) {
      return 'fnv1a64-legacy';
    }
  }

  throw new Error('NFC payload signature verification failed.');
}

export async function verifyNfcPayload(payload: ParsedNfcPayload): Promise<VerifyResult> {
  const signatureScheme = validateSignature(payload);
  const payloadHash = computePayloadHash(payload);
  const nowMs = Date.now();

  return withReplayStore((store) => {
    const knownHashAt = store.payloadHashes[payloadHash];
    const duplicate = Number.isFinite(knownHashAt);
    const existing = store.devices[payload.hardwareId];
    enforceMonotonicRules(payload, existing);

    const replayStatus: ReplayStatus = duplicate ? 'duplicate' : 'new';
    const receiptId = crypto.randomUUID();
    const receipt: ScanReceipt = {
      id: receiptId,
      payloadHash,
      hardwareId: payload.hardwareId,
      version: payload.version,
      replayStatus,
      receivedAtMs: nowMs,
      details:
        payload.version === 2
          ? {
              bootId: payload.bootId,
              nfcSeq: payload.nfcSeq,
              sampleSeq: payload.sampleSeq,
              tempMax: payload.tempMax,
              humiMax: payload.humiMax,
              flag: payload.flag,
            }
          : {
              ts: payload.ts,
              tempMax: payload.tempMax,
              humiMax: payload.humiMax,
              flag: payload.flag,
            },
    };

    store.payloadHashes[payloadHash] = nowMs;
    store.receipts[receiptId] = receipt;

    if (payload.version === 2) {
      const previous = store.devices[payload.hardwareId];
      const lastBootId = Math.max(previous?.lastBootId ?? 0, payload.bootId);
      const sameBoot = (previous?.lastBootId ?? 0) === payload.bootId;
      store.devices[payload.hardwareId] = {
        hardwareId: payload.hardwareId,
        lastBootId,
        lastNfcSeq: sameBoot ? Math.max(previous?.lastNfcSeq ?? 0, payload.nfcSeq) : payload.nfcSeq,
        lastSampleSeq: sameBoot ? Math.max(previous?.lastSampleSeq ?? 0, payload.sampleSeq) : payload.sampleSeq,
        updatedAtMs: nowMs,
      };
    }

    return {
      verified: true,
      replayStatus,
      receiptId,
      receivedAt: nowMs,
      signatureScheme,
    };
  });
}
