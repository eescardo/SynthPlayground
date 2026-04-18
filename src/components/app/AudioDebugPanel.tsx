"use client";

import { useState } from "react";

interface AudioDebugPanelProps {
  rendererLabel: string;
}

export function AudioDebugPanel({ rendererLabel }: AudioDebugPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8
      }}
    >
      {open && (
        <div
          role="dialog"
          aria-label="Audio renderer debug"
          style={{
            minWidth: 168,
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(19, 27, 35, 0.96)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.28)",
            color: "#f3f6f8",
            fontSize: 12,
            lineHeight: 1.4
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Audio Debug</div>
          <div>
            Renderer: <span style={{ color: "#8be9c1" }}>{rendererLabel}</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Toggle audio debug panel"
        aria-expanded={open}
        style={{
          border: "1px solid rgba(255, 255, 255, 0.14)",
          background: "rgba(19, 27, 35, 0.88)",
          color: "#f3f6f8",
          borderRadius: 999,
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.22)"
        }}
      >
        dbg
      </button>
    </div>
  );
}
