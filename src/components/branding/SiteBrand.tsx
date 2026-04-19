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

export function PatchWorkspaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="#122130" stroke="#7ABFF2" strokeOpacity="0.35" />
      <path d="M6.5 7.25C6.5 6.83579 6.83579 6.5 7.25 6.5H10C10.4142 6.5 10.75 6.83579 10.75 7.25V10C10.75 10.4142 10.4142 10.75 10 10.75H7.25C6.83579 10.75 6.5 10.4142 6.5 10V7.25Z" fill="#6FCBFF" />
      <path d="M13.25 7.25C13.25 6.83579 13.5858 6.5 14 6.5H16.75C17.1642 6.5 17.5 6.83579 17.5 7.25V10C17.5 10.4142 17.1642 10.75 16.75 10.75H14C13.5858 10.75 13.25 10.4142 13.25 10V7.25Z" fill="#B8F06C" />
      <path d="M6.5 14C6.5 13.5858 6.83579 13.25 7.25 13.25H10C10.4142 13.25 10.75 13.5858 10.75 14V16.75C10.75 17.1642 10.4142 17.5 10 17.5H7.25C6.83579 17.5 6.5 17.1642 6.5 16.75V14Z" fill="#F4B86A" />
      <path d="M13.25 14C13.25 13.5858 13.5858 13.25 14 13.25H16.75C17.1642 13.25 17.5 13.5858 17.5 14V16.75C17.5 17.1642 17.1642 17.5 16.75 17.5H14C13.5858 17.5 13.25 17.1642 13.25 16.75V14Z" fill="#9E8BFF" />
      <path d="M6.5 12H17.5M12 6.5V17.5" stroke="#0B131D" strokeOpacity="0.45" strokeLinecap="round" />
    </svg>
  );
}

export function BackArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 6L4 12L10 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
