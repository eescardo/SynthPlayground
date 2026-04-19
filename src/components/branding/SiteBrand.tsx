import { useId } from "react";

interface SiteBrandProps {
  label?: string;
  className?: string;
}

export function SiteBrand({ label, className }: SiteBrandProps) {
  const classes = ["site-brand", label ? "" : "site-brand-icon-only", className].filter(Boolean).join(" ");
  const gradientId = useId();

  return (
    <div className={classes} role={label ? undefined : "img"} aria-label={label ? undefined : "SynthSprout"} title="SynthSprout">
      <svg className="site-brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect x="6" y="6" width="52" height="52" rx="16" fill="#0F1822" />
        <rect x="6.75" y="6.75" width="50.5" height="50.5" rx="15.25" stroke="#6BC7FF" strokeOpacity="0.35" strokeWidth="1.5" />
        <circle cx="32" cy="32" r="22" fill={`url(#${gradientId})`} />
        <path d="M21.5 42C24.5 39 28 37.5 32 37.5C36 37.5 39.5 39 42.5 42" stroke="#73CEFF" strokeWidth="3" strokeLinecap="round" />
        <path d="M32 42V25.25" stroke="#A7F577" strokeWidth="3" strokeLinecap="round" />
        <path d="M32 25.25C23.25 24.75 19.75 17.75 21.25 9.25C28.25 10.25 32.5 14.75 32 25.25Z" fill="#A1F577" />
        <path d="M32 27.25C39.5 28 44.25 22.75 44.75 14.5C38 13.75 33.25 18.5 32 27.25Z" fill="#5BDA72" />
        <path d="M24.75 15.75C27.25 16.75 29.5 19 31 22" stroke="#D8FFB3" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.78" />
        <path d="M39 18C36.75 19 34.75 21 33.25 23.75" stroke="#CFFFAD" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.72" />
        <defs>
          <radialGradient id={gradientId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(24 18.5) rotate(54.4623) scale(37.0558)">
            <stop stopColor="#132738" />
            <stop offset="1" stopColor="#0A121A" />
          </radialGradient>
        </defs>
      </svg>
      {label ? <span className="site-brand-label">{label}</span> : null}
    </div>
  );
}

export function PatchWorkspaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="#122130" stroke="#7ABFF2" strokeOpacity="0.35" />
      <rect x="5" y="5" width="6.5" height="6.5" rx="1.75" fill="#6ACBFF" />
      <path d="M12.5 7.25C12.5 6.00736 13.5074 5 14.75 5H19V9.25C19 10.4926 17.9926 11.5 16.75 11.5H12.5V7.25Z" fill="#B9F36C" />
      <path d="M5 14.75C5 13.5074 6.00736 12.5 7.25 12.5H11.5V16.75C11.5 17.9926 10.4926 19 9.25 19H5V14.75Z" fill="#F0A85E" />
      <rect x="12.5" y="12.5" width="6.5" height="6.5" rx="1.75" fill="#8A8EFF" />
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
