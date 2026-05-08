import './globals.css';
import { Metadata } from 'next';
import { SolanaProviders } from './wallet-shell';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';

export const metadata: Metadata = {
  title: 'DePIN Data Exchange — verified real-world data',
  description:
    'A verifiable marketplace for IoT and DePIN data streams on Solana — staked providers, on-chain quality scoring, cryptographic snapshots.',
  metadataBase: new URL('https://depinxchg.dev'),
  openGraph: {
    title: 'DePIN Data Exchange',
    description: 'Buy, sell and verify real-world data streams on Solana.',
    type: 'website',
    images: ['/og.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.svg'],
  },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-ink">
        <SolanaProviders>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ink focus:text-cream focus:px-3 focus:py-1.5 focus:text-sm focus:rounded-md"
          >
            Skip to content
          </a>
          <Nav />
          <main id="main">{children}</main>
          <Footer />
        </SolanaProviders>
      </body>
    </html>
  );
}
