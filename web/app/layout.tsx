import './globals.css';
import Link from 'next/link';
import { SolanaProviders } from './providers';
import { WalletButton } from './WalletButton';

export const metadata = {
  title: 'DePIN Data Exchange',
  description: 'Marketplace for verified IoT and DePIN data streams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SolanaProviders>
          <header className="bg-white border-b border-earth-200 sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <Link href="/" className="font-semibold text-lg tracking-tight text-earth-500">
                  DePIN<span className="text-forest"> Exchange</span>
                </Link>
                <nav className="flex gap-1 text-sm">
                  <Link href="/" className="px-3 py-1.5 text-earth-400 hover:text-earth-500 rounded-md hover:bg-earth-100">
                    Marketplace
                  </Link>
                  <Link href="/provider" className="px-3 py-1.5 text-earth-400 hover:text-earth-500 rounded-md hover:bg-earth-100">
                    Provider
                  </Link>
                </nav>
              </div>
              <WalletButton />
            </div>
          </header>
          <main>{children}</main>
        </SolanaProviders>
      </body>
    </html>
  );
}
