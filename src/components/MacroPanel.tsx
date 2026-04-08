"use client";

export interface MacroPanelRow {
  id: string;
  top: number;
  bindTitle: string;
  bindAriaLabel: string;
  bindIcon: string;
  onBindToggle: () => void;
  expandTitle?: string;
  expandAriaLabel?: string;
  expandIcon?: string;
  onExpandToggle?: () => void;
  expandPlaceholder?: boolean;
}

interface MacroPanelProps {
  panelTop: number | null;
  panelHeight: number;
  rows: MacroPanelRow[];
}

export function MacroPanel({ panelTop, panelHeight, rows }: MacroPanelProps) {
  if (panelTop === null || rows.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className="track-inspector-panel"
        style={{
          top: `${panelTop}px`,
          height: `${panelHeight}px`
        }}
      />
      {rows.map((row) => (
        <div key={row.id} className="track-inspector-row icon-only" style={{ top: `${row.top}px` }}>
          <div className="track-inspector-row-actions">
            <button
              type="button"
              className="track-inspector-action-button"
              title={row.bindTitle}
              aria-label={row.bindAriaLabel}
              onClick={row.onBindToggle}
            >
              {row.bindIcon}
            </button>
            <button
              type="button"
              className={`track-inspector-action-button${row.expandPlaceholder ? " placeholder" : ""}`}
              title={row.expandTitle ?? "Expand lane"}
              aria-label={row.expandAriaLabel ?? "Expand lane"}
              disabled={!row.onExpandToggle}
              onClick={row.onExpandToggle}
            >
              {row.expandIcon ?? " "}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
