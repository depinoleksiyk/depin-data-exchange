'use client';

import { ReactNode } from 'react';
import { useReveal } from '../lib/motion';

export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}) {
  const { ref, reveal } = useReveal<HTMLElement>();
  const Component = Tag as any;
  return (
    <Component
      ref={ref as any}
      {...reveal}
      style={{ transitionDelay: `${delay}ms` }}
      className={className}
    >
      {children}
    </Component>
  );
}
