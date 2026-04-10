import { NextResponse } from 'next/server';

import { verifyNfcPayload } from '@/lib/server/nfc-verify';
import type { ParsedNfcPayload } from '@/lib/nfc-payload-contract';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ParsedNfcPayload;
    const result = await verifyNfcPayload(payload);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not verify NFC payload.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
