"use client";

import styles from "./TrackCanvas.module.css";

export interface MacroPanelRow {
  id: string;
  label: string;
  stateLabel?: string;
  top: number;
  height: number;
  expanded: boolean;
  bindTitle: string;
  bindAriaLabel: string;
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
          className={`track-inspector-row ${styles.inspectorRow}${row.expanded ? ` ${styles.inspectorRowExpanded}` : ""}`}
          style={{
            top: `${row.top - panelTop}px`,
            height: `${row.height}px`
          }}
        >
          <div className={`track-inspector-row-label ${styles.inspectorRowLabel}`}>
            <span className={`track-inspector-name ${styles.inspectorName}`}>{row.label}</span>
          </div>
          <div className={`track-inspector-row-actions ${styles.inspectorRowActions}`}>
            <span className={`${styles.inspectorStatusPill}${row.onExpandToggle ? ` ${styles.hasExpand}` : ""}`}>
              <button
                type="button"
                className={`track-inspector-action-button ${styles.inspectorStatusButton}`}
                title={row.bindTitle}
                aria-label={row.bindAriaLabel}
                onClick={row.onBindToggle}
              >
                {row.stateLabel}
              </button>
              {row.onExpandToggle && (
                <button
                  type="button"
                  className={`track-inspector-action-button ${styles.inspectorExpandButton}`}
                  title={row.expandTitle ?? "Expand lane"}
                  aria-label={row.expandAriaLabel ?? "Expand lane"}
                  onClick={row.onExpandToggle}
                >
                  {row.expandIcon ?? " "}
                </button>
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
