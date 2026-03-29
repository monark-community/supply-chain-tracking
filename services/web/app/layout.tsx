import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletClientProvider } from '@/components/auth/wallet-client-provider';
import { WalletAuthProvider } from '@/components/auth/wallet-auth-context';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: "ChainProof - Decentralized Supply Chain Traceability",
  description: "Blockchain-based supply chain tracking system that records each step of a product\'s journey",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={inter.className}>
        <WalletClientProvider>
          <WalletAuthProvider>{children}</WalletAuthProvider>
        </WalletClientProvider>
      </body>
    </html>
  );
}
