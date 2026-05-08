'use client';

const BATCH_ENV_SNAPSHOT_STORAGE_KEY = 'chainproof:batch-env-snapshots:v1';

const TEMP_MIN_ALLOWED_C = -5;
const TEMP_MAX_ALLOWED_C = 27;
const HUMI_MIN_ALLOWED_PCT = -5;
const HUMI_MAX_ALLOWED_PCT = 40;

type StoredBatchEnvSnapshot = {
  batchId: number;
  tempMin: number;
  tempMax: number;
  humiMin: number;
  humiMax: number;
  flag2: number;
  capturedAt: number;
};

type BatchEnvSnapshotMap = Record<string, StoredBatchEnvSnapshot>;

export type BatchEnvironmentAlert = {
  hasData: boolean;
  breached: boolean;
  summary: string;
  details: string;
  snapshot: StoredBatchEnvSnapshot | null;
};

function canUseWindow() {
  return typeof window !== 'undefined';
}

function readSnapshotMap(): BatchEnvSnapshotMap {
  if (!canUseWindow()) return {};
  try {
    const raw = window.localStorage.getItem(BATCH_ENV_SNAPSHOT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BatchEnvSnapshotMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function buildBreachDetails(snapshot: StoredBatchEnvSnapshot): string[] {
  const details: string[] = [];
  const tempBreached = snapshot.tempMin < TEMP_MIN_ALLOWED_C || snapshot.tempMax > TEMP_MAX_ALLOWED_C;
  const humiBreached = snapshot.humiMin < HUMI_MIN_ALLOWED_PCT || snapshot.humiMax > HUMI_MAX_ALLOWED_PCT;

  if (snapshot.flag2 & 0x1) {
    details.push('Temperature out of allowed range');
  } else if (tempBreached) {
    details.push('Temperature min/max exceeded limits');
  }

  if (snapshot.flag2 & 0x2) {
    details.push('Humidity out of allowed range');
  } else if (humiBreached) {
    details.push('Humidity min/max exceeded limits');
  }

  return details;
}

export function getBatchEnvironmentAlert(batchId: number | null | undefined): BatchEnvironmentAlert {
  if (!canUseWindow() || !batchId || batchId <= 0) {
    return {
      hasData: false,
      breached: false,
      summary: 'No environmental data',
      details: 'No NFC payload snapshot has been captured for this batch yet.',
      snapshot: null,
    };
  }

  const map = readSnapshotMap();
  const snapshot = map[String(batchId)] ?? null;
  if (!snapshot) {
    return {
      hasData: false,
      breached: false,
      summary: 'No environmental data',
      details: 'No NFC payload snapshot has been captured for this batch yet.',
      snapshot: null,
    };
  }

  const breachDetails = buildBreachDetails(snapshot);
  if (breachDetails.length === 0) {
    return {
      hasData: true,
      breached: false,
      summary: 'Environment OK',
      details: `Temp ${snapshot.tempMin.toFixed(1)}-${snapshot.tempMax.toFixed(1)} C | Humidity ${snapshot.humiMin.toFixed(1)}-${snapshot.humiMax.toFixed(1)} %`,
      snapshot,
    };
  }

  return {
    hasData: true,
    breached: true,
    summary: 'Temperature/Humidity breached',
    details: breachDetails.join(' • '),
    snapshot,
  };
}
