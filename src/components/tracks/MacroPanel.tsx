"use client";

import { MouseEvent as ReactMouseEvent } from "react";
import { TriangleGlyph } from "@/components/icons/TriangleGlyph";
import { VerticalDirection } from "@/types/direction";
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
  expandDirection?: VerticalDirection;
  onExpandToggle?: () => void;
}

interface MacroPanelProps {
  panelTop: number | null;
  panelHeight: number;
  rows: MacroPanelRow[];
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
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
      className={styles.macroPanelArea}
      data-track-chrome="macro-panel"
      style={{
        top: `${panelTop}px`,
        height: `${panelHeight}px`
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onDoubleClick={onDoubleClick}
    >
      <div className={styles.inspectorPanel} />
      {rows.map((row) => (
        <div
          key={row.id}
          className={`${styles.inspectorRow}${row.expanded ? ` ${styles.inspectorRowExpanded}` : ""}`}
          style={{
            top: `${row.top - panelTop}px`,
            height: `${row.height}px`
          }}
        >
          <div className={styles.inspectorRowLabel}>
            <span className={styles.inspectorName}>{row.label}</span>
          </div>
          <div className={styles.inspectorRowActions}>
            <span className={`${styles.inspectorStatusPill}${row.onExpandToggle ? ` ${styles.hasExpand}` : ""}`}>
              <button
                type="button"
                className={styles.inspectorStatusButton}
                data-testid="track-inspector-action-button"
                title={row.bindTitle}
                aria-label={row.bindAriaLabel}
                onClick={row.onBindToggle}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                {row.stateLabel}
              </button>
              {row.onExpandToggle && (
                <button
                  type="button"
                  className={styles.inspectorExpandButton}
                  data-testid="track-inspector-action-button"
                  title={row.expandTitle ?? "Expand lane"}
                  aria-label={row.expandAriaLabel ?? "Expand lane"}
                  onClick={row.onExpandToggle}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <TriangleGlyph direction={row.expandDirection ?? "down"} className={styles.expandGlyph} />
                </button>
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
