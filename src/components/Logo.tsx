/** The flexfare mark: a lowercase "f" whose crossbar breaks off into a dot (the arrival). */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--signal)" />
      <g fill="none" stroke="var(--ink)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 26V13.5a6.5 6.5 0 0 1 6.5-6.5H21" />
        <path d="M8.5 16h8.5" />
      </g>
      <circle cx="22.5" cy="16" r="2" fill="var(--ink)" />
    </svg>
  );
}

export const BRAND = 'flexfare';
