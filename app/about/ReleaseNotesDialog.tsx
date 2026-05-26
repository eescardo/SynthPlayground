"use client";

import { useEffect, useId, useState } from "react";
import { releaseNotes } from "@/content/releaseNotes";

const releaseDateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export function ReleaseNotesDialog() {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button type="button" className="about-secondary-action" onClick={() => setOpen(true)}>
        View full release notes
      </button>
      {open && (
        <div className="about-modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="about-release-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="about-dialog-header">
              <h2 id={titleId}>Release Notes</h2>
              <button
                type="button"
                className="about-icon-button"
                aria-label="Close release notes"
                onClick={() => setOpen(false)}
              >
                x
              </button>
            </div>
            <div className="about-release-history">
              {releaseNotes.map((entry) => (
                <article key={entry.version} className="about-release-entry">
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
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
