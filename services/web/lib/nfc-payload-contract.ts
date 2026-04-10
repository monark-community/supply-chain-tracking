export type NfcPayloadV1 = {
  version: 1;
  hardwareId: string;
  batchIdHint: number | null;
  tempMax: number;
  humiMax: number;
  flag: number;
  ts: number;
  sig: string;
};

export type NfcPayloadV2 = {
  version: 2;
  hardwareId: string;
  batchIdHint: number | null;
  tempMax: number;
  humiMax: number;
  flag: number;
  bootId: number;
  nfcSeq: number;
  sampleSeq: number;
  sig: string;
};

export type ParsedNfcPayload = NfcPayloadV1 | NfcPayloadV2;

function toFiniteNumber(value: string | null, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${field} in NFC payload.`);
  }
  return parsed;
}

function toPositiveIntOrNull(value: string | null): number | null {
  if (!value) return null;
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toNonNegativeInt(value: string | null, field: string): number {
  const parsed = Math.floor(toFiniteNumber(value, field));
  if (parsed < 0) {
    throw new Error(`Invalid ${field} in NFC payload.`);
  }
  return parsed;
}

export function canonicalPayload(payload: ParsedNfcPayload): string {
  if (payload.version === 2) {
    return (
      `v=2&hardware_id=${payload.hardwareId}` +
      `&boot_id=${payload.bootId}` +
      `&nfc_seq=${payload.nfcSeq}` +
      `&sample_seq=${payload.sampleSeq}` +
      `&temp_max=${payload.tempMax.toFixed(2)}` +
      `&humi_max=${payload.humiMax.toFixed(2)}` +
      `&flag=${payload.flag}`
    );
  }

  return `hardware_id=${payload.hardwareId}&temp_max=${payload.tempMax.toFixed(2)}&humi_max=${payload.humiMax.toFixed(
    2
  )}&ts=${payload.ts}`;
}

export function parseNfcPayloadFromSearchParams(searchParams: URLSearchParams): ParsedNfcPayload {
  const hardwareId = (searchParams.get('hardware_id') || '').trim();
  if (!hardwareId) {
    throw new Error('Missing hardware_id in NFC payload.');
  }

  const sig = (searchParams.get('sig') || '').trim().toLowerCase();
  if (!sig) {
    throw new Error('Missing signature in NFC payload.');
  }

  const versionRaw = (searchParams.get('v') || '').trim();
  const hasV2Counters = !!(searchParams.get('boot_id') || searchParams.get('nfc_seq') || searchParams.get('sample_seq'));
  const version = versionRaw === '2' || hasV2Counters ? 2 : 1;

  if (version === 2) {
    return {
      version: 2,
      hardwareId,
      batchIdHint: toPositiveIntOrNull(searchParams.get('batch_id')),
      tempMax: toFiniteNumber(searchParams.get('temp_max'), 'temp_max'),
      humiMax: toFiniteNumber(searchParams.get('humi_max'), 'humi_max'),
      flag: toNonNegativeInt(searchParams.get('flag') || '0', 'flag'),
      bootId: toNonNegativeInt(searchParams.get('boot_id'), 'boot_id'),
      nfcSeq: toNonNegativeInt(searchParams.get('nfc_seq'), 'nfc_seq'),
      sampleSeq: toNonNegativeInt(searchParams.get('sample_seq'), 'sample_seq'),
      sig,
    };
  }

  return {
    version: 1,
    hardwareId,
    batchIdHint: toPositiveIntOrNull(searchParams.get('batch_id')),
    tempMax: toFiniteNumber(searchParams.get('temp_max'), 'temp_max'),
    humiMax: toFiniteNumber(searchParams.get('humi_max'), 'humi_max'),
    flag: toNonNegativeInt(searchParams.get('flag') || '0', 'flag'),
    ts: toNonNegativeInt(searchParams.get('ts'), 'ts'),
    sig,
  };
}
