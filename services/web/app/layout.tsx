import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletAuthProvider } from '@/components/auth/wallet-auth-provider';

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
        <WalletAuthProvider>{children}</WalletAuthProvider>
      </body>
    </html>
  );
}
