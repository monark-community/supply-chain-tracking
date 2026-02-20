'use client';

import { useState } from 'react';
import { Nav } from '@/components/nav';
import { useNFC } from '@/hooks/useNFC';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DemoRole = 'producer' | 'transporter' | 'warehouse';
type Verdict = 'valid' | 'rejected' | null;

type ParsedTagPayload = {
  batchId: string | null;
  flagged: boolean | null;
  raw: string;
};

const ROLE_STORAGE_KEY = 'chainproof-nfc-demo-role';

const parseTagPayload = (raw: string): ParsedTagPayload => {
  try {
    const parsed = JSON.parse(raw) as { batchId?: unknown; flagged?: unknown };
    const batchId = typeof parsed.batchId === 'string' ? parsed.batchId : null;
    const flagged =
      typeof parsed.flagged === 'boolean'
        ? parsed.flagged
        : typeof parsed.flagged === 'string'
          ? parsed.flagged.toLowerCase() === 'true'
          : null;

    return { batchId, flagged, raw };
  } catch {
    return { batchId: raw || null, flagged: null, raw };
  }
};

export default function ScannerPage() {
  const [role, setRole] = useState<DemoRole>(() => {
    if (typeof window === 'undefined') {
      return 'producer';
    }

    const saved = window.localStorage.getItem(ROLE_STORAGE_KEY) as DemoRole | null;
    return saved ?? 'producer';
  });
  const [statusMessage, setStatusMessage] = useState('Ready for NFC flow.');
  const [mockReadPayload, setMockReadPayload] = useState('{"batchId":"BATCH-DEMO-001","flagged":false}');
  const [mockWritePayload, setMockWritePayload] = useState('START_SENSOR');
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    isSupported,
    isReading,
    isWriting,
    lastRead,
    lastWritten,
    error,
    readTag,
    writeTag,
    mockRead,
    mockWrite,
  } = useNFC();

  const handleRoleChange = (value: string) => {
    const nextRole = value as DemoRole;
    setRole(nextRole);
    window.localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
    setVerdict(null);
    setStatusMessage(`Role changed to ${nextRole}.`);
  };

  const createDemoBatchId = () => `BATCH-${Date.now()}`;

  const runDemoApi = async (
    endpoint: 'createShipment' | 'startShipment' | 'receiveShipment' | 'finalizeVerdict',
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; batchId?: string }> => {
    // TODO: DEMO ONLY - REVISIT FOR PRODUCTION.
    // TODO: DEMO ONLY - REVISIT FOR PRODUCTION.
    // UI-only placeholder while backend/API routes are pending.
    await new Promise((resolve) => setTimeout(resolve, 450));

    if (endpoint === 'createShipment') {
      return { ok: true, batchId: createDemoBatchId() };
    }

    if (endpoint === 'startShipment' || endpoint === 'receiveShipment' || endpoint === 'finalizeVerdict') {
      return { ok: true, batchId: typeof payload.batchId === 'string' ? payload.batchId : undefined };
    }

    return { ok: true };
  };

  const readFromTag = async (): Promise<string> => {
    if (isSupported) {
      return readTag();
    }

    // TODO: DEMO ONLY - REVISIT FOR PRODUCTION.
    return mockRead(mockReadPayload);
  };

  const writeToTag = async (payload: string): Promise<void> => {
    if (isSupported) {
      await writeTag(payload);
      return;
    }

    // TODO: DEMO ONLY - REVISIT FOR PRODUCTION.
    mockWrite(payload);
    setMockWritePayload(payload);
  };

  const handleProducerFlow = async () => {
    setIsSubmitting(true);
    setVerdict(null);

    try {
      setStatusMessage('Creating shipment on-chain...');
      const createResult = await runDemoApi('createShipment', { role, contractMethod: 'harvestBatch' });
      const batchId = createResult.batchId ?? createDemoBatchId();
      const payload = JSON.stringify({ batchId, flagged: false });

      setLastBatchId(batchId);
      setMockReadPayload(payload);
      setStatusMessage('Tap tag again to write batchId to IoT device.');
      await writeToTag(payload);
      setStatusMessage(`Shipment created and batch ${batchId} written to tag.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Producer flow failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransporterFlow = async () => {
    setIsSubmitting(true);
    setVerdict(null);

    try {
      setStatusMessage('Tap tag to read batchId and take transporter custody.');
      const raw = await readFromTag();
      const parsed = parseTagPayload(raw);
      if (!parsed.batchId) {
        throw new Error('No batchId found on NFC tag.');
      }

      setLastBatchId(parsed.batchId);
      await runDemoApi('startShipment', {
        batchId: parsed.batchId,
        contractMethod: 'initiateTransfer/receiveBatch',
      });

      setStatusMessage('Custody updated. Tap again to send START_SENSOR to MCU.');
      await writeToTag('START_SENSOR');
      setStatusMessage(`Transporter flow complete for ${parsed.batchId}.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Transporter flow failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWarehouseFlow = async () => {
    setIsSubmitting(true);

    try {
      setStatusMessage('First tap: confirm warehouse receipt and read MCU flag.');
      const raw = await readFromTag();
      const parsed = parseTagPayload(raw);
      if (!parsed.batchId) {
        throw new Error('No batchId found on NFC tag.');
      }

      setLastBatchId(parsed.batchId);

      // TODO: DEMO ONLY - REVISIT FOR PRODUCTION.
      // First tap performs custody receipt + sensor flag read for immediate verdict display.
      await runDemoApi('receiveShipment', {
        batchId: parsed.batchId,
        contractMethod: 'receiveBatch',
      });

      const isFlagged = parsed.flagged ?? false;
      const nextVerdict: Verdict = isFlagged ? 'rejected' : 'valid';
      setVerdict(nextVerdict);

      setStatusMessage(
        `Warehouse custody confirmed for ${parsed.batchId}. Verdict: ${nextVerdict.toUpperCase()}. Final tap to STOP sensor and persist verdict.`
      );

      await writeToTag('STOP_SENSOR');
      await runDemoApi('finalizeVerdict', {
        batchId: parsed.batchId,
        flagged: isFlagged,
      });
      setStatusMessage(`Warehouse flow complete for ${parsed.batchId}.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Warehouse flow failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>NFC Shipment Console</CardTitle>
            <CardDescription>
              Role-based NFC flow for Producer, Transporter, and Warehouse with desktop mock fallback.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="active-role">Active Role</Label>
              <Select value={role} onValueChange={handleRoleChange}>
                <SelectTrigger id="active-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="producer">Producer</SelectItem>
                  <SelectItem value="transporter">Transporter</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isSupported ? 'success' : 'warning'}>
                {isSupported ? 'WebNFC supported' : 'WebNFC unavailable (desktop mock active)'}
              </Badge>
              <Badge variant={isReading ? 'secondary' : 'outline'}>{isReading ? 'Reading tag...' : 'Reader idle'}</Badge>
              <Badge variant={isWriting ? 'secondary' : 'outline'}>{isWriting ? 'Writing tag...' : 'Writer idle'}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role Action</CardTitle>
            <CardDescription>Run the required flow for the selected role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {role === 'producer' ? (
              <Button disabled={isSubmitting} onClick={handleProducerFlow}>
                Create Shipment
              </Button>
            ) : null}

            {role === 'transporter' ? (
              <Button disabled={isSubmitting} onClick={handleTransporterFlow}>
                Scan Pallet
              </Button>
            ) : null}

            {role === 'warehouse' ? (
              <Button disabled={isSubmitting} onClick={handleWarehouseFlow}>
                Receive Pallet
              </Button>
            ) : null}

            {verdict ? (
              <div
                className={`rounded-xl px-4 py-8 text-center text-5xl font-black sm:text-7xl ${
                  verdict === 'valid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {verdict === 'valid' ? 'VALID' : 'REJECTED'}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Desktop Mock NFC Controls</CardTitle>
            <CardDescription>Use this on browsers without WebNFC support.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mock-read-payload">Mock NFC Read Payload</Label>
              <input
                id="mock-read-payload"
                value={mockReadPayload}
                onChange={(event) => setMockReadPayload(event.target.value)}
                className="h-10 w-full rounded-lg border-2 border-gray-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
              />
              <Button
                variant="outline"
                onClick={() => {
                  const payload = mockRead(mockReadPayload);
                  setStatusMessage(`Mock read completed: ${payload}`);
                }}
              >
                Mock NFC Read
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mock-write-payload">Mock NFC Write Payload</Label>
              <input
                id="mock-write-payload"
                value={mockWritePayload}
                onChange={(event) => setMockWritePayload(event.target.value)}
                className="h-10 w-full rounded-lg border-2 border-gray-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
              />
              <Button
                variant="outline"
                onClick={() => {
                  mockWrite(mockWritePayload);
                  setStatusMessage(`Mock write completed: ${mockWritePayload}`);
                }}
              >
                Mock NFC Write
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live Demo State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-semibold">Status:</span> {statusMessage}
            </p>
            <p>
              <span className="font-semibold">Last Batch ID:</span> {lastBatchId ?? 'N/A'}
            </p>
            <p>
              <span className="font-semibold">Last Read Payload:</span> {lastRead ?? 'N/A'}
            </p>
            <p>
              <span className="font-semibold">Last Write Payload:</span> {lastWritten ?? 'N/A'}
            </p>
            {error ? (
              <p className="font-semibold text-red-600">NFC Error: {error}</p>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
