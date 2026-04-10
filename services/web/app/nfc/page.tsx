'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { resolveNfcScanContext, parseNfcPayloadFromSearchParams, type ResolvedNfcScanContext } from '@/lib/nfc-scan-payload';
import { savePendingNfcScan } from '@/lib/nfc-scan-session';
import { useWalletAuth } from '@/components/auth/wallet-auth-context';

const SESSION_SETTLE_TIMEOUT_MS = 2500;

function NfcEntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { account, role, status } = useWalletAuth();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState('Parsing NFC payload...');
  const [resolvedContext, setResolvedContext] = useState<ResolvedNfcScanContext | null>(null);
  const hasNavigatedRef = useRef(false);

  const payloadKey = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    hasNavigatedRef.current = false;
    setResolvedContext(null);
    setError(null);
    setStep('Parsing NFC payload...');
  }, [payloadKey]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setStep('Parsing NFC payload...');
        const parsed = parseNfcPayloadFromSearchParams(searchParams);
        setStep('Verifying NFC payload with backend...');
        const resolved = await resolveNfcScanContext(parsed);
        if (cancelled) return;
        savePendingNfcScan(resolved, '/scanner');
        setResolvedContext(resolved);
        setStep('NFC payload verified. Checking wallet session...');
      } catch (entryError) {
        if (cancelled) return;
        setError(entryError instanceof Error ? entryError.message : 'Could not process NFC payload.');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [searchParams, payloadKey]);

  useEffect(() => {
    if (!resolvedContext || error || hasNavigatedRef.current) {
      return;
    }

    const goToLogin = (reason?: string) => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      const query = reason ? `?reason=${encodeURIComponent(reason)}` : '';
      setStep('Redirecting to sign in...');
      router.replace(`/auth/login${query}`);
    };

    if (!account || status === 'disconnected') {
      goToLogin();
      return;
    }

    if (status === 'wrong_chain') {
      setStep('Wallet connected on wrong network. Redirecting to sign in...');
      goToLogin('wrong_chain');
      return;
    }

    if (status === 'error') {
      setStep('Wallet session error. Redirecting to sign in...');
      goToLogin('session_error');
      return;
    }

    if (status === 'unassigned_role' || (status === 'connected' && role === 'none')) {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      setStep('Redirecting to role assignment...');
      router.replace('/auth/assign-role');
      return;
    }

    if (status === 'connected' && role !== 'none') {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      setStep(
        resolvedContext.mappingStatus === 'unmapped'
          ? 'Opening harvest flow for unmapped hardware...'
          : 'Opening batch action page...'
      );
      router.replace('/scanner');
      return;
    }

    if (status === 'idle' || status === 'connecting') {
      setStep('Finalizing wallet session...');
      const timer = window.setTimeout(() => {
        if (hasNavigatedRef.current) return;
        if (status === 'idle' || status === 'connecting') {
          setStep('Session check timed out. Redirecting to sign in...');
          goToLogin('session_timeout');
        }
      }, SESSION_SETTLE_TIMEOUT_MS);
      return () => window.clearTimeout(timer);
    }
  }, [account, error, resolvedContext, role, router, status]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>NFC Deep Link</CardTitle>
          <CardDescription>Processing signed hardware payload and preparing role-gated actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="secondary">{step}</Badge>
          {error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-gray-600">Please wait...</p>}
        </CardContent>
      </Card>
    </div>
  );
}

export default function NfcEntryPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-sm text-gray-600">Loading NFC payload...</div>}>
      <NfcEntryContent />
    </Suspense>
  );
}
