import Link from "next/link";
import { releaseNotes } from "@/content/releaseNotes";
import { ReleaseNotesDialog } from "./ReleaseNotesDialog";

const latestRelease = releaseNotes[0];

export default function AboutPage() {
  return (
    <main className="about-page">
      <div className="about-shell">
        <header className="about-hero">
          <Link className="about-back-link" href="/">
            Back to composer
          </Link>
          <p className="about-eyebrow">About</p>
          <h1>SynthSprout</h1>
          <p>
            SynthSprout is a browser-based music composition and synthesis playground for sketching songs, designing
            patches, and exploring sound without leaving the creative surface.
          </p>
        </header>

        <section className="about-section about-release-summary" aria-labelledby="release-notes-title">
          <div>
            <p className="about-eyebrow">Latest release</p>
            <h2 id="release-notes-title">
              {latestRelease.version} · {latestRelease.title}
            </h2>
            <p>{latestRelease.summary}</p>
          </div>
          <ReleaseNotesDialog />
        </section>

        <section className="about-section" aria-labelledby="terms-title">
          <h2 id="terms-title">Terms of Use</h2>
          <p>
            SynthSprout is provided as-is for creative exploration, composition, patch design, and personal or
            project-based music work. You are responsible for the music, project files, presets, and audio you create,
            export, publish, or share.
          </p>
          <p>
            The app may change over time, and features may be revised, removed, or interrupted. SynthSprout does not
            provide warranties that the app will be error-free or that exported work will be suitable for every purpose.
          </p>
        </section>

        <section className="about-section" aria-labelledby="privacy-title">
          <h2 id="privacy-title">Privacy Notice</h2>
          <p>SynthSprout currently runs in your browser and does not require accounts.</p>
          <p>
            If analytics or error reporting are enabled, limited technical information such as browser type, device
            information, pages visited, and anonymized usage metrics may be collected to improve the product.
          </p>
          <p>
            Audio projects and compositions currently remain fully local unless explicitly shared or uploaded in the
            future.
          </p>
          <p>
            Contact: <a href="mailto:help@synthsprout.com">help@synthsprout.com</a>
          </p>
        </section>
      </div>
    </main>
  );
}
