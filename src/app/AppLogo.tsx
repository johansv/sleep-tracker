export function AppLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#262b4f" />
          <stop offset="1" stopColor="#12152a" />
        </linearGradient>
        <linearGradient id="logo-bar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a5a3ff" />
          <stop offset="1" stopColor="#f5cf8a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-bg)" />
      <path d="M36 14a15 15 0 1 0 14 20A12 12 0 0 1 36 14Z" fill="#a5a3ff" />
      <rect x="14" y="45" width="36" height="6" rx="3" fill="url(#logo-bar)" />
    </svg>
  );
}
