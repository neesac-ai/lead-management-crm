import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Simple Meta "infinity" logo mark (SVG).
 * - Uses currentColor so it can be styled via Tailwind classes.
 * - Not an exact trademark-perfect vector, but a clean Meta-like mark for UI.
 */
export function MetaLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      role="img"
      aria-label="Meta"
      className={cn('h-10 w-10', className)}
    >
      <path
        d="M18.6 34.2C13.4 34.2 9.3 29.1 7.5 23.5c-1.6-5 .1-10.7 3.4-14.6C13.3 6 16 5 18.8 5c4.6 0 8.4 4.5 13.1 12.1l.1.2.1-.2C36.8 9.5 40.6 5 45.2 5c2.8 0 5.5 1 7.9 3.9 3.3 3.9 5 9.6 3.4 14.6-1.8 5.6-5.9 10.7-11.1 10.7-4.9 0-9.2-5.2-13.4-12l-.1-.2-.1.2c-4.2 6.8-8.5 12-13.2 12Z"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

