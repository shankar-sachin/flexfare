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
