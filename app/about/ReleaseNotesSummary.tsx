"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ReleaseNoteEntry } from "@/content/releaseNotes";
import { ReleaseNotesDialog } from "./ReleaseNotesDialog";

interface ReleaseNotesSummaryProps {
  entries: ReleaseNoteEntry[];
}

export function ReleaseNotesSummary({ entries }: ReleaseNotesSummaryProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const visibleListRef = useRef<HTMLDivElement | null>(null);
  const measureListRef = useRef<HTMLDivElement | null>(null);

  const measureVisibleEntries = useCallback(() => {
    const visibleList = visibleListRef.current;
    const measureList = measureListRef.current;
    if (!visibleList || !measureList) return;

    const availableHeight = visibleList.clientHeight + 0.5;
    let nextVisibleCount = 0;

    for (const entryElement of Array.from(measureList.children)) {
      if (!(entryElement instanceof HTMLElement)) continue;
      const entryBottom = entryElement.offsetTop + entryElement.offsetHeight;
      if (entryBottom > availableHeight) {
        break;
      }
      nextVisibleCount += 1;
    }

    setVisibleCount((currentVisibleCount) =>
      currentVisibleCount === nextVisibleCount ? currentVisibleCount : nextVisibleCount
    );
  }, []);

  useLayoutEffect(() => {
    measureVisibleEntries();
  }, [entries, measureVisibleEntries]);

  useLayoutEffect(() => {
    const visibleList = visibleListRef.current;
    const measureList = measureListRef.current;
    if (!visibleList || !measureList) return;

    let animationFrame: number | null = null;
    const requestMeasure = () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        measureVisibleEntries();
      });
    };

    const resizeObserver = new ResizeObserver(requestMeasure);
    resizeObserver.observe(visibleList);
    resizeObserver.observe(measureList);

    document.fonts?.ready.then(requestMeasure);
    return () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      resizeObserver.disconnect();
    };
  }, [measureVisibleEntries]);

  return (
    <div className="about-release-summary" aria-labelledby="release-notes-title">
      <div className="about-release-summary-copy">
        <p className="about-eyebrow">Latest releases</p>
        <h2 id="release-notes-title">Latest releases</h2>
        <div className="about-release-summary-list-frame">
          <div ref={visibleListRef} className="about-release-summary-list about-release-summary-list--visible">
            {entries.slice(0, visibleCount).map((entry) => (
              <ReleaseNotesSummaryEntry key={entry.version} entry={entry} />
            ))}
          </div>
          <div
            ref={measureListRef}
            className="about-release-summary-list about-release-summary-list--measure"
            aria-hidden="true"
          >
            {entries.map((entry) => (
              <ReleaseNotesSummaryEntry key={entry.version} entry={entry} />
            ))}
          </div>
        </div>
      </div>
      <ReleaseNotesDialog />
    </div>
  );
}

function ReleaseNotesSummaryEntry({ entry }: { entry: ReleaseNoteEntry }) {
  return (
    <article className="about-release-summary-entry">
      <h3>
        {entry.version} · {entry.title}
      </h3>
      <p>{entry.summary}</p>
    </article>
  );
}
