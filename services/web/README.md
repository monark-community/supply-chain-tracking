## ChainProof Web

Next.js frontend for the ChainProof workflow with:

- Wallet-based auth (MetaMask + WalletConnect)
- Role-based UI routing by on-chain wallet role
- NFC-driven producer activation flow

## Environment

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_CHAINPROOF_RPC_URL`: RPC endpoint for your local chain
- `NEXT_PUBLIC_CHAINPROOF_CHAIN_ID`: local chain id (for example `1337`)
- `NEXT_PUBLIC_CHAINPROOF_CONTRACT_KEY`: registry key (default `chainproof`)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: WalletConnect project id (required for mobile/iOS WalletConnect)
- `NEXT_PUBLIC_ENABLE_MANUAL_WALLET`: optional debug fallback (`true`/`false`) to allow private-key login form

## Run Locally

```bash
npm install
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open from desktop at `http://localhost:3000`.

## Wallet Login With Local Chain

1. Start your local chain and deploy contracts.
2. Ensure the RPC is reachable from your laptop browser at `NEXT_PUBLIC_CHAINPROOF_RPC_URL`.
3. Add that network to MetaMask using the same chain id as `NEXT_PUBLIC_CHAINPROOF_CHAIN_ID`.
4. Import/fund one of your local dev accounts in MetaMask.
5. Open the app and connect wallet from the login page.

## iPhone/iPad (WalletConnect + MetaMask)

1. Expose your local RPC to phone-accessible HTTPS (via Cloudflare Tunnel).
2. Point `NEXT_PUBLIC_CHAINPROOF_RPC_URL` to that public RPC URL.
3. Run the web app on a phone-reachable host (`npm run dev -- --hostname 0.0.0.0 --port 3000`).
4. Open the site on iOS Safari.
5. Tap wallet connect in login, choose WalletConnect, then approve in MetaMask app.
6. Return to Safari and continue role assignment / app actions.

## Notes

- Contract writes are signed by the currently connected wallet account.
- On-chain role checks still determine allowed actions.
- Manual private-key mode is intentionally hidden behind `NEXT_PUBLIC_ENABLE_MANUAL_WALLET=true` for debugging only.
