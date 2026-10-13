// ─────────────────────────────────────────────────────────────
// client/src/features/legal/LegalPageShell.jsx
//
// The frame around the Privacy Policy and Terms of Service: the
// landing page's header and footer styling, a readable column of text
// between them. Public, so it brings its own colours (landingpage.css)
// and does not follow the signed-in theme, like the landing page.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LANDING, LEGAL } from '../../routes/paths';
import { LEGAL_DETAILS, looksLikeEmail } from './legalDetails';

export function ContactDetails() {
  const { contactName, contactEmail, informationOfficer, organisation } = LEGAL_DETAILS;
  return (
    <ul className="lol-legal-contact">
      <li>{organisation}</li>
      <li>Contact: {contactName}</li>
      <li>
        Email:{' '}
        {looksLikeEmail(contactEmail) ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a> : contactEmail}
      </li>
      <li>Information Officer: {informationOfficer}</li>
    </ul>
  );
}

export default function LegalPageShell({ title, intro, children }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Batches for Ladles`;
    return () => { document.title = previous; };
  }, [title]);

  return (
    <div className="lol-landing lol-legal-page">
      <a href="#legal-content" className="lol-skip-link">Skip to content</a>

      <header className="lol-nav">
        <div className="lol-nav-inner">
          <Link to={LANDING} className="lol-nav-brand" aria-label="Back to the home page">
            <img src="/images/BatchesLogo.png" alt="Batches for Ladles" className="lol-nav-logo" />
          </Link>
          <nav className="lol-legal-nav" aria-label="Legal pages">
            <Link to={LEGAL.privacy} className="lol-nav-link">Privacy Policy</Link>
            <Link to={LEGAL.terms} className="lol-nav-link">Terms of Service</Link>
            <Link to="/login" className="lol-nav-link">Log in</Link>
          </nav>
        </div>
      </header>

      <main id="legal-content" className="lol-legal">
        <div className="lol-legal-inner">
          <p className="lol-eyebrow">{LEGAL_DETAILS.organisation}</p>
          <h1 className="lol-legal-title">{title}</h1>
          <p className="lol-legal-updated">Last updated {LEGAL_DETAILS.lastUpdated}</p>
          {intro && <p className="lol-legal-intro">{intro}</p>}
          {children}
        </div>
      </main>

      <footer className="lol-footer">
        <div className="lol-section-inner">
          <div className="lol-footer-bottom lol-footer-bottom--only">
            <span>© {LEGAL_DETAILS.organisation} · Warehouse Management System</span>
            <span className="lol-footer-legal">
              <Link to={LANDING}>Home</Link>
              <Link to={LEGAL.privacy}>Privacy Policy</Link>
              <Link to={LEGAL.terms}>Terms of Service</Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
