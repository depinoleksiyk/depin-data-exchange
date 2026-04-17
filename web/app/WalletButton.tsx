'use client';

import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(m => m.WalletMultiButton),
  { ssr: false }
);

export function WalletButton() {
  return (
    <WalletMultiButton
      style={{
        backgroundColor: '#2d6a4f',
        borderRadius: '8px',
        fontSize: '14px',
        height: '36px',
        padding: '0 16px',
        fontFamily: 'Sora, sans-serif',
      }}
    />
  );
}
