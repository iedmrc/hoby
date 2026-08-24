interface LogoProps {
  size?: number;
}

export function Logo({ size = 34 }: LogoProps) {
  return (
    <svg
      aria-label="Hoby"
      height={size}
      role="img"
      viewBox="0 0 48 48"
      width={size}
    >
      <rect fill="#172d2a" height="48" rx="13" width="48" />
      <path
        d="M14 14v20M34 14v20M14 24h20"
        fill="none"
        stroke="#f7f5ef"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <circle cx="34" cy="14" fill="#f47b5f" r="4.5" />
    </svg>
  );
}

