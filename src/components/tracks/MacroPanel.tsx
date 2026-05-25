"use client";

import styles from "./TrackCanvas.module.css";

export interface MacroPanelRow {
  id: string;
  label: string;
  stateLabel?: string;
  top: number;
  bindTitle: string;
  bindAriaLabel: string;
  bindIcon: string;
  onBindToggle: () => void;
  expandTitle?: string;
  expandAriaLabel?: string;
  expandIcon?: string;
  onExpandToggle?: () => void;
}

interface MacroPanelProps {
  panelTop: number | null;
  panelHeight: number;
  rows: MacroPanelRow[];
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onDoubleClick?: () => void;
}

export function MacroPanel({
  panelTop,
  panelHeight,
  rows,
  onMouseEnter,
  onMouseLeave,
  onDoubleClick
}: MacroPanelProps) {
  if (panelTop === null) {
    return null;
  }

  return (
    <div
      className={`track-macro-panel-area ${styles.macroPanelArea}`}
      style={{
        top: `${panelTop}px`,
        height: `${panelHeight}px`
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onDoubleClick={onDoubleClick}
    >
      <div className={`track-inspector-panel ${styles.inspectorPanel}`} />
      {rows.map((row) => (
        <div
          key={row.id}
          className={`track-inspector-row ${styles.inspectorRow}`}
          style={{ top: `${row.top - panelTop}px` }}
        >
          <div className={`track-inspector-row-label ${styles.inspectorRowLabel}`}>
            <span className={`track-inspector-name ${styles.inspectorName}`}>{row.label}</span>
            {row.stateLabel && (
              <span className={`track-inspector-state ${styles.inspectorState}`}>{row.stateLabel}</span>
            )}
          </div>
          <div className={`track-inspector-row-actions ${styles.inspectorRowActions}`}>
            <button
              type="button"
              className={`track-inspector-action-button ${styles.inspectorActionButton}`}
              title={row.bindTitle}
              aria-label={row.bindAriaLabel}
              onClick={row.onBindToggle}
            >
              {row.bindIcon}
            </button>
            {row.onExpandToggle && (
              <button
                type="button"
                className={`track-inspector-action-button ${styles.inspectorActionButton}`}
                title={row.expandTitle ?? "Expand lane"}
                aria-label={row.expandAriaLabel ?? "Expand lane"}
                onClick={row.onExpandToggle}
              >
                {row.expandIcon ?? " "}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
