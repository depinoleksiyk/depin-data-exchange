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
    }, message.tone === 'error' ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  const palette =
    message.tone === 'success'
      ? { bg: '#2d5a27', fg: '#faf5ea', border: '#22451e', accent: '#faf5ea' }
      : message.tone === 'error'
      ? { bg: '#1c1816', fg: '#faf5ea', border: '#b3352c', accent: '#f4a48f' }
      : { bg: '#1c1816', fg: '#faf5ea', border: '#bdad8b', accent: '#c79215' };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border-l-[3px] p-4 ${
        visible ? 'animate-slideInRight' : 'opacity-0 translate-y-2 pointer-events-none'
      }`}
      style={{
        background: palette.bg,
        color: palette.fg,
        borderColor: palette.border,
        boxShadow: '0 22px 48px -20px rgba(19, 17, 14, 0.55)',
        transition: 'opacity 240ms ease, transform 240ms ease',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium leading-snug" style={{ color: palette.fg }}>
          {message.title}
        </div>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 200);
          }}
          className="text-xs opacity-70 hover:opacity-100 transition-opacity shrink-0"
          style={{ color: palette.fg }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      {message.body && (
        <div className="mt-1.5 text-xs leading-relaxed opacity-90" style={{ color: palette.fg }}>
          {message.body}
        </div>
      )}
      {message.link && (
        <a
          href={message.link.href}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:gap-2 transition-all"
          style={{ color: palette.accent }}
        >
          {message.link.label} →
        </a>
      )}
    </div>
  );
}
