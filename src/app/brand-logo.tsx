type BrandLogoProps = {
  compact?: boolean;
  inverse?: boolean;
};

export function BrandMark({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="brand-pill-blue" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1565ff" />
        </linearGradient>
        <linearGradient id="brand-pill-green" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#22c55e" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <rect fill="#16a34a" height="17" rx="2" width="7" x="34" y="39" />
      <rect fill="#16a34a" height="25" rx="2" width="7" x="44" y="31" />
      <rect fill="#7ed957" height="34" rx="2" width="7" x="54" y="22" />
      <g transform="rotate(-43 29 29)">
        <rect fill="url(#brand-pill-green)" height="24" rx="12" width="50" x="4" y="17" />
        <path d="M29 17h13a12 12 0 0 1 12 12 12 12 0 0 1-12 12H29Z" fill="url(#brand-pill-blue)" />
        <path d="M29 18v22" stroke="#fff" strokeWidth="3" />
        <path d="M10 27a8 8 0 0 1 8-7" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="2" />
        <path d="M36 20h6a8 8 0 0 1 7 4" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="2" />
      </g>
      <path d="m30 50 18-18v7h9v6h-9v7Z" fill="#fff" stroke="#0d1b3d" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

export function BrandLogo({ compact = false, inverse = false }: BrandLogoProps) {
  return (
    <div aria-label="PharmaStock — Track, Sell, Grow" className="inline-flex min-w-0 items-center gap-2.5">
      <BrandMark className={compact ? "h-10 w-10 shrink-0" : "h-12 w-12 shrink-0 sm:h-14 sm:w-14"} />
      <div className="min-w-0">
        <p className={`${compact ? "text-xl" : "text-2xl sm:text-3xl"} brand-wordmark leading-none`}>
          <span className={inverse ? "text-white" : "text-[#0d1b3d]"}>Pharma</span>
          <span className="text-[#16a34a]">Stock</span>
        </p>
        <p className={`brand-tagline mt-1 ${inverse ? "text-white/80" : "text-[#1565ff]"}`}>
          Track <span>•</span> Sell <span>•</span> Grow
        </p>
      </div>
    </div>
  );
}
