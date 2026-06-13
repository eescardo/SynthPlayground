"use client";

import {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
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
  active?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export function MacroPanel({
  panelTop,
  panelHeight,
  rows,
  active = true,
  onMouseEnter,
  onMouseLeave,
  onPointerDown,
  onDoubleClick
}: MacroPanelProps) {
  if (panelTop === null) {
    return null;
  }

  const handleButtonKeyDown = (onAction: () => void) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) {
      onAction();
    }
  };

  return (
    <div
      className={`${styles.macroPanelArea}${active ? "" : ` ${styles.macroPanelAreaInactive}`}`}
      data-track-chrome="macro-panel"
      style={{
        top: `${panelTop}px`,
        height: `${panelHeight}px`
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={onPointerDown}
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
                disabled={!active}
                onClick={row.onBindToggle}
                onKeyDown={handleButtonKeyDown(row.onBindToggle)}
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
                  disabled={!active}
                  onClick={row.onExpandToggle}
                  onKeyDown={handleButtonKeyDown(row.onExpandToggle)}
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
