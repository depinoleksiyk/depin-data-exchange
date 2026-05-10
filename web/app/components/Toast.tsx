'use client';

import { useEffect, useState } from 'react';

type Tone = 'info' | 'success' | 'error';

export type ToastMessage = {
  tone: Tone;
  title: string;
  body?: string;
  link?: { href: string; label: string };
};

export function Toast({ message, onDismiss }: { message: ToastMessage | null; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 260);
    }, message.tone === 'error' ? 6500 : 4500);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  const toneCls =
    message.tone === 'success'
      ? 'bg-forest text-cream border-forest-dark'
      : message.tone === 'error'
      ? 'bg-ink text-cream border-danger'
      : 'bg-parchment text-ink border-earth-200';

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 max-w-sm panel border p-4 ${toneCls} ${
        visible ? 'animate-slideInRight' : 'opacity-0 translate-y-2 pointer-events-none'
      }`}
      style={{
        boxShadow: '0 20px 40px -18px rgba(28, 24, 22, 0.35)',
        transition: 'opacity 240ms ease, transform 240ms ease',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium">{message.title}</div>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 220);
          }}
          className="text-xs opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      {message.body && <div className="mt-1 text-xs opacity-85 leading-relaxed">{message.body}</div>}
      {message.link && (
        <a
          href={message.link.href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:gap-2 transition-all"
        >
          {message.link.label} →
        </a>
      )}
    </div>
  );
}
