import Link from "next/link";
import { releaseNotes } from "@/content/releaseNotes";
import { APP_NAME, SUPPORT_EMAIL, UI_TEXT } from "@/lib/uiText";
import { ReleaseNotesDialog } from "./ReleaseNotesDialog";

const latestRelease = releaseNotes[0];

export default function AboutPage() {
  return (
    <main className="about-page">
      <div className="about-shell">
        <Link className="about-back-link" href="/">
          Back to composer
        </Link>

        <div className="about-columns">
          <div className="about-column">
            <header className="about-hero">
              <p className="about-eyebrow">{UI_TEXT.about.eyebrow}</p>
              <h1>{APP_NAME}</h1>
              <p>{UI_TEXT.about.purpose}</p>
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
          </div>

          <div className="about-column">
            <section className="about-section" aria-labelledby="terms-title">
              <h2 id="terms-title">Terms of Use</h2>
              <p>{UI_TEXT.about.terms}</p>
              <p>{UI_TEXT.about.termsAvailability}</p>
            </section>

            <section className="about-section" aria-labelledby="privacy-title">
              <h2 id="privacy-title">Privacy Notice</h2>
              <p>{UI_TEXT.about.privacyIntro}</p>
              <p>
                If analytics or error reporting are enabled, limited technical information such as browser type, device
                information, pages visited, and anonymized usage metrics may be collected to improve the product.
              </p>
              <p>
                Audio projects and compositions currently remain fully local unless explicitly shared or uploaded in the
                future.
              </p>
              <p>
                Contact: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
