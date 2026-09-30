"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ReleaseNoteEntry } from "@/content/releaseNotes";
import { UI_TEXT } from "@/lib/uiText";

interface ReleaseNotesSummaryProps {
  entries: ReleaseNoteEntry[];
}

const releaseDateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export function ReleaseNotesSummary({ entries }: ReleaseNotesSummaryProps) {
  const [showDetails, setShowDetails] = useState(false);
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
    if (showDetails) return;
    measureVisibleEntries();
  }, [entries, measureVisibleEntries, showDetails]);

  useLayoutEffect(() => {
    if (showDetails) return;

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
  }, [measureVisibleEntries, showDetails]);

  const eyebrow = showDetails ? UI_TEXT.about.releaseDetails : UI_TEXT.about.latestReleases;
  const heading = showDetails ? UI_TEXT.about.releaseNotes : UI_TEXT.about.latestReleases;

  return (
    <div
      className={`about-release-summary${showDetails ? " about-release-summary--details" : ""}`}
      aria-labelledby="release-notes-title"
    >
      <div className="about-release-summary-header">
        <div className="about-release-summary-title">
          <p className="about-eyebrow">{eyebrow}</p>
          <h2 id="release-notes-title">{heading}</h2>
        </div>
        <button
          type="button"
          className="about-release-toggle-pill"
          aria-pressed={showDetails}
          onClick={() => setShowDetails((current) => !current)}
        >
          {showDetails ? UI_TEXT.about.showLatestReleases : UI_TEXT.about.showReleaseDetails}
        </button>
      </div>

      {showDetails ? (
        <div className="about-release-detail-scroll">
          <div className="about-release-history">
            {entries.map((entry) => (
              <ReleaseNotesDetailEntry key={entry.version} entry={entry} />
            ))}
          </div>
        </div>
      ) : (
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
      )}
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

function ReleaseNotesDetailEntry({ entry }: { entry: ReleaseNoteEntry }) {
  return (
    <article className="about-release-entry">
      <div className="about-release-meta">
        <span>{entry.version}</span>
        <time dateTime={entry.date}>{releaseDateFormatter.format(new Date(`${entry.date}T00:00:00`))}</time>
      </div>
      <h3>{entry.title}</h3>
      <p>{entry.summary}</p>
      <ul>
        {entry.changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
    </article>
  );
}
