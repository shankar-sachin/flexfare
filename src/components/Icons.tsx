type P = { size?: number; color?: string };
const base = (size: number, color: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color,
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const ArrowRight = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
);
export const ArrowUpRight = ({ size = 18, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
);
export const Swap = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></svg>
);
export const Calendar = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>
);
export const Sparkle = ({ size = 18, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>
);
export const Check = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><path d="m5 12 5 5L20 7" /></svg>
);
export const Clock = ({ size = 18, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);

/** The Google "G" in its brand colours (kept as-is, per Google's sign-in button guidelines). */
export const GoogleG = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);
