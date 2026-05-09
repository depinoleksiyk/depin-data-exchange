'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletChip } from '../WalletChip';

const TABS = [
  { href: '/marketplace', label: 'Marketplace', match: (p: string) => p.startsWith('/marketplace') || p.startsWith('/listing') },
  { href: '/provider', label: 'For Providers', match: (p: string) => p.startsWith('/provider') },
  { href: '/docs', label: 'Docs', match: (p: string) => p.startsWith('/docs') },
];

export function Nav() {
  const pathname = usePathname() || '/';

  return (
    <header className="border-b border-earth-100 bg-cream/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-forest text-cream text-[11px] font-semibold tracking-tight overflow-hidden transition-transform duration-300 group-hover:scale-110">
            DX
            <span className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-br from-forest-light/40 to-transparent transition-opacity duration-300" />
          </span>
          <span className="text-[15px] font-display text-ink tracking-tight group-hover:text-forest transition-colors duration-300">
            DePIN Exchange
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                data-active={active ? 'true' : 'false'}
                className={`nav-link ${active ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <WalletChip />
        </div>
      </div>
    </header>
  );
}
