interface SiteBrandProps {
  label?: string;
  className?: string;
}

export function SiteBrand({ label, className }: SiteBrandProps) {
  const classes = ["site-brand", label ? "" : "site-brand-icon-only", className].filter(Boolean).join(" ");

  return (
    <div className={classes} role={label ? undefined : "img"} aria-label={label ? undefined : "SynthSprout"} title="SynthSprout">
      <svg className="site-brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect x="6" y="6" width="52" height="52" rx="16" fill="#0F1822" />
        <rect x="6.75" y="6.75" width="50.5" height="50.5" rx="15.25" stroke="#6BC7FF" strokeOpacity="0.35" strokeWidth="1.5" />
        <path d="M23 42C26.3333 37.3333 29.6667 37.3333 33 42C36.3333 46.6667 39.6667 46.6667 43 42" stroke="#6BC7FF" strokeWidth="4" strokeLinecap="round" />
        <path d="M32 43V28" stroke="#DDF4FF" strokeWidth="4" strokeLinecap="round" />
        <path d="M31.5 27.5C23.5 27.5 19 20.5 20 12.5C27.5 12.5 32 17 31.5 27.5Z" fill="#7CF0AA" />
        <path d="M32.5 27.5C40.5 27.5 45 20.5 44 12.5C36.5 12.5 32 17 32.5 27.5Z" fill="#4FC5FF" />
      </svg>
      {label ? <span className="site-brand-label">{label}</span> : null}
    </div>
  );
}
