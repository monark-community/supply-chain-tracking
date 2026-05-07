'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletAuth } from './wallet-auth-context';

// Sends the user to `/` whenever the wallet transitions from connected to
// disconnected (manual Disconnect button, wallet-side lock, or accountsChanged
// emptying out). Fresh page loads with no account never trigger a redirect, so
// the sign-in flow at /auth/login keeps working.
export function DisconnectRedirector() {
  const router = useRouter();
  const { account } = useWalletAuth();
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    if (account) {
      wasConnectedRef.current = true;
      return;
    }
    if (wasConnectedRef.current) {
      wasConnectedRef.current = false;
      router.replace('/');
    }
  }, [account, router]);

  return null;
}
