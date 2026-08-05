// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate }        from 'react-router-dom';
import '../styles/landingpage.css';

// ── Image fallback ──────────────────────────────────────────
function ImgWithFallback({ src, alt, fallbackText, fallbackPath, className }) {
  return (
    <div className="img-slot">
      <img
        src={src}
        alt={alt}
        className={className}
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }}
      />
      <div className="img-slot__fallback">
        <p>{fallbackText || 'Add image here'}</p>
        {fallbackPath && <small>{fallbackPath}</small>}
      </div>
    </div>
  );
}

// ── Inline SVG icons ────────────────────────────────────────
const ICON_PATHS = {
  bowl:     'M3 12h18a9 9 0 0 1-18 0Zm2-3c2.2-2 13.8-2 16 0M8.5 5.5l1 2M15.5 5.5l-1 2',
  sprout:   'M12 21V12M12 12C7 12 4 8 4 4c5 0 9 3 9 8Zm0 0c5 0 9-3.5 9-8-5 0-9 3-9 8Z',
  hands:    'M7 12l-3.5 3.5a2 2 0 0 0 2.8 2.8L8 16.5M12 14l3 3a2 2 0 0 0 2.8-2.8L13 9.5 10 11M7 12l3.5-5 3.5 1 2.5 3.5',
  pin:      'M12 22s7-6.7 7-12.3A7 7 0 1 0 5 9.7C5 15.3 12 22 12 22Zm0-9.3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  shield:   'M12 22s8-3.6 8-10.2V5.6L12 3 4 5.6v6.2C4 18.4 12 22 12 22Zm-3.2-9.4 2.2 2.2 4.2-4.4',
  arrow:    'M5 12h14M13 6l6 6-6 6',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
};

const Icon = ({ name, size = 20 }) => (
  <svg
    className="lol-icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={ICON_PATHS[name]} />
  </svg>
);

// ── Content ──────────────────────────────────────────────────
const PROGRAMMES = [
  {
    id: 'noc',
    icon: 'bowl',
    code: 'NOC',
    name: 'Nourish Our Children',
    description:
      "Two nutritious meals reach small children and their teachers at preschools across the network, recorded from the moment a delivery arrives to the moment a parcel is packed.",
    img: '/images/NOC.jpg',
  },
  {
    id: 'fts',
    icon: 'sprout',
    code: 'FTS',
    name: 'Feed the Soil',
    description:
      "Food that can't go to a plate becomes compost for local farms, and the farms send fresh vegetables back to the warehouse in return.",
    img: '/images/FTS.jpg',
  },
  {
    id: 'la',
    icon: 'hands',
    code: 'LA',
    name: 'Love Activism',
    description:
      'Volunteers, teams and sponsors give a few hours at the warehouse, packing, sorting and making up parcels for the week ahead.',
    img: '/images/LA.jpg',
  },
  {
    id: 'dsk',
    icon: 'bowl',
    code: 'DSK',
    name: 'Dignity & Soup Kitchens',
    description:
      'Providing hot meals and essential supplies with dignity to homeless and vulnerable communities through a network of soup kitchens, ensuring no one goes to bed hungry.',
    img: '/images/Ladleshearts.jpg',
  },
];

const STATS = [
  { value: '48M+', label: 'Meals served since 2020' },
  { value: '2014', label: 'Founded with one soup kitchen' },
  { value: '3',    label: 'Provinces reached' },
];

const VALUES = [
  { icon: 'shield', text: 'Every parcel is trackable, from delivery note to dispatch.' },
  { icon: 'pin',    text: 'Built for people moving between the receiving bay, the packing tables and the loading dock.' },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = 'Ladles of Love · Warehouse System';
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="lol-landing">
      <a href="#lol-signin" className="lol-skip-link">Skip to log in</a>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="lol-nav">
        <div className="lol-nav-inner">
          <div className="lol-nav-brand">
            <img
              src="/icons/favicon.svg"
              alt="Ladles of Love"
              className="lol-nav-logo"
            />
            <div>
              <p className="lol-nav-title">Ladles of Love</p>
              <p className="lol-nav-sub">Warehouse System</p>
            </div>
          </div>
          <nav className="lol-nav-actions" aria-label="Account">
            <button type="button" className="lol-btn-text" onClick={() => navigate('/guest')}>
              I'm volunteering today
            </button>
            <button
              type="button"
              id="lol-signin"
              className="lol-btn-primary"
              onClick={() => navigate('/login')}
            >
              Log in
            </button>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className={`lol-hero${ready ? ' is-ready' : ''}`}>
          <div
            className="lol-hero-bg"
            style={{ backgroundImage: 'url(/images/dannyheartinghero.jpeg)' }}
            aria-hidden="true"
          />
          <div className="lol-hero-overlay" aria-hidden="true" />

          <div className="lol-hero-inner">
            <div className="lol-hero-copy">
              <p className="lol-eyebrow lol-eyebrow--on-dark">Ladles of Love · Operations</p>
              <h1 className="lol-hero-title">
                One ladle. One Mission. <em>The warehouse</em> where it happens.
              </h1>
              <p className="lol-hero-lede">
                Every pallet that leaves this warehouse starts here. It gets recorded, checked
                and sent on its way to a preschool, a shelter or a soup kitchen across the
                Western Cape, Northern Cape and Gauteng.
              </p>
              <div className="lol-hero-actions">
                <button
                  type="button"
                  className="lol-btn-primary lol-btn-large"
                  onClick={() => navigate('/login')}
                >
                  Log in to your account
                  <Icon name="arrow" size={18} />
                </button>
                <button
                  type="button"
                  className="lol-btn-secondary lol-btn-large"
                  onClick={() => navigate('/guest')}
                >
                  I'm volunteering today
                </button>
              </div>
              <dl className="lol-stat-ledger">
                {STATS.map((s) => (
                  <div className="lol-stat" key={s.label}>
                    <dt>{s.value}</dt>
                    <dd>{s.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Actual logo replaces the animated ladle */}
            <div className="lol-hero-icon">
              <div className="lol-hero-icon-frame" aria-hidden="true">
                <img
                  src="/icons/icons2.png"
                  alt="Ladles of Love logo"
                  className="lol-hero-logo"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Programmes ──────────────────────────────────── */}
        <section className="lol-programmes" aria-labelledby="lol-programmes-title">
          <div className="lol-section-inner">
            <p className="lol-eyebrow">What you're signing in to</p>
            <h2 id="lol-programmes-title" className="lol-section-title">
              Four programmes, one warehouse
            </h2>
            <div className="lol-programme-grid">
              {PROGRAMMES.map((p) => (
                <article className="lol-programme-card" key={p.id}>
                  <ImgWithFallback
                    src={p.img}
                    alt={p.name}
                    className="lol-programme-card__photo"
                    fallbackText={p.code}
                    fallbackPath={p.img}
                  />
                  <div className="lol-programme-card__body">
                    <div className="lol-programme-icon">
                      <Icon name={p.icon} size={22} />
                    </div>
                    <p className="lol-programme-code">{p.code}</p>
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Story ───────────────────────────────────────── */}
        <section className="lol-story">
          <div className="lol-section-inner">
            <p className="lol-eyebrow">Why this exists</p>
            <h2 className="lol-section-title">
              Built from the ground up alongisde our warehouse staff and volunteers
            </h2>
            <p>
              Ladles of Love started in 2014 with one soup kitchen and a single weekly pot of
              soup. Today the organisation works across the Western Cape, Northern Cape and
              Gauteng, running preschool nutrition, dignity and soup kitchens, compost exchanges with local
              farms and hands‑on volunteer days, and has served over 48 million meals since
              2020. This system replaces the paper forms and scattered spreadsheets that used
              to hold that work together, built from time spent on the warehouse floor with the
              people who receive, pack and dispatch every day.
            </p>
            <div className="lol-values">
              {VALUES.map((v) => (
                <div className="lol-value" key={v.text}>
                  <span className="lol-value-icon"><Icon name={v.icon} size={20} /></span>
                  <p>{v.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Get involved ────────────────────────────────── */}
        <section className="lol-getinvolved">
          <div className="lol-section-inner lol-getinvolved-inner">
            <div>
              <h2 className="lol-section-title lol-section-title-light">New here?</h2>
              <p>
                This web application is for staff and volunteers signing in to work at our warehouses. If you'd like to
                donate, volunteer or find out more about Ladles of Love, please check out our{''}
                <a 
                 href="https://ladlesoflove.org.za/"
                 target="_blank"
                 rel="noopener noreferrer"
                >
                  main website. 
                </a>
                
              </p>
            </div>
            <a
              className="lol-btn-outline-light"
              href="https://ladlesoflove.org.za/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit ladlesoflove.org.za
              <Icon name="external" size={16} />
            </a>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="lol-footer">
        <div className="lol-section-inner lol-footer-inner">
          <div>
            <p className="lol-footer-title">Ladles of Love</p>
            <p className="lol-footer-meta">
              Unit 4, Hewett Park, 17 Hewett Avenue, Epping 2, Cape Town
            </p>
            <p className="lol-footer-meta"> 
              35th Street, Johannesburg, 2090
            </p>
          </div>
          <div className="lol-footer-links">
            <a href="https://www.instagram.com/ladlesoflove" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href="https://www.facebook.com/ladlesofloveZA/" target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href="https://twitter.com/ladlesoflove" target="_blank" rel="noopener noreferrer">X</a>
            <a href="https://za.linkedin.com/company/ladles-of-love" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <a href="https://www.tiktok.com/@ladlesoflove" target="_blank" rel="noopener noreferrer">TikTok</a>
            <a href="https://ladlesoflove.org.za/" target="_blank" rel="noopener noreferrer">Website</a>
          </div>
          <p className="lol-footer-copy">© Ladles of Love · Warehouse Management System</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;