"use client";

import { BrowserCompatibilityIssue } from "@/lib/browserCompatibility";

interface BrowserCompatibilityDialogProps {
  issue: BrowserCompatibilityIssue | null;
  onClose: () => void;
}

export function BrowserCompatibilityDialog({ issue, onClose }: BrowserCompatibilityDialogProps) {
  if (!issue) {
    return null;
  }

  return (
    <div className="help-modal-backdrop" role="dialog" aria-modal="true" aria-label={issue.title} onClick={onClose}>
      <div className="help-modal" onClick={(event) => event.stopPropagation()}>
        <h3>{issue.title}</h3>
        <p>{issue.summary}</p>
        <div style={{ display: "grid", gap: 12 }}>
          {issue.requirements.map((requirement) => (
            <div
              key={requirement.id}
              style={{
                padding: 12,
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)"
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{requirement.label}</div>
              <div style={{ marginBottom: 4 }}>{requirement.description}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Supported browsers: {requirement.supportedBrowsers}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
