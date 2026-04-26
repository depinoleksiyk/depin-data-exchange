import { ReactNode } from 'react';

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  className = '',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'forest' | 'clay' | 'sunflower';
  className?: string;
}) {
  const toneCls =
    tone === 'forest'
      ? 'text-forest-dark'
      : tone === 'clay'
      ? 'text-clay'
      : tone === 'sunflower'
      ? 'text-sunflower'
      : 'text-ink';

  return (
    <div className={`panel px-4 py-3.5 transition-all duration-300 hover:border-forest/30 hover:shadow-lift group ${className}`}>
      <div className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">{label}</div>
      <div className={`mt-1 text-xl font-display tabular transition-transform duration-300 group-hover:-translate-y-px ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-ink-soft">{hint}</div>}
    </div>
  );
}
