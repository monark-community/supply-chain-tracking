import { NextResponse } from 'next/server';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export async function GET() {
  try {
    const registryPath = path.resolve(process.cwd(), '..', 'smart-contracts', 'config', 'contracts.json');
    const raw = await fs.readFile(registryPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load contracts registry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
