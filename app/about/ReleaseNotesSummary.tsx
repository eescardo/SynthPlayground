"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ReleaseNoteEntry } from "@/content/releaseNotes";
import { ReleaseNotesDialog } from "./ReleaseNotesDialog";

interface ReleaseNotesSummaryProps {
  entries: ReleaseNoteEntry[];
}

export function ReleaseNotesSummary({ entries }: ReleaseNotesSummaryProps) {
  const [visibleCount, setVisibleCount] = useState(entries.length);
  const [measureVersion, setMeasureVersion] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const entryRefs = useRef<Array<HTMLElement | null>>([]);

  const measureVisibleEntries = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerBottom = container.getBoundingClientRect().bottom + 0.5;
    let nextVisibleCount = 0;

    for (const entryElement of entryRefs.current.slice(0, entries.length)) {
      if (!entryElement) continue;
      if (entryElement.getBoundingClientRect().bottom > containerBottom) {
        break;
      }
      nextVisibleCount += 1;
    }

    setVisibleCount(nextVisibleCount);
  }, [entries.length]);

  useLayoutEffect(() => {
    setVisibleCount(entries.length);
  }, [entries.length]);

  useLayoutEffect(() => {
    measureVisibleEntries();
  }, [measureVisibleEntries, measureVersion, visibleCount]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      setVisibleCount(entries.length);
      setMeasureVersion((current) => current + 1);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [entries.length]);

  return (
    <div ref={containerRef} className="about-release-summary" aria-labelledby="release-notes-title">
      <div className="about-release-summary-copy">
        <p className="about-eyebrow">Latest releases</p>
        <h2 id="release-notes-title">Latest releases</h2>
        <div className="about-release-summary-list">
          {entries.slice(0, visibleCount).map((entry, index) => (
            <article
              key={entry.version}
              ref={(element) => {
                entryRefs.current[index] = element;
              }}
              className="about-release-summary-entry"
            >
              <h3>
                {entry.version} · {entry.title}
              </h3>
              <p>{entry.summary}</p>
            </article>
          ))}
        </div>
      </div>
      <ReleaseNotesDialog />
    </div>
  );
}
