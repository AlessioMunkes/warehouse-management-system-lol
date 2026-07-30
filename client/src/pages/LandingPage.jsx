// ─────────────────────────────────────────────────────────────
// src/pages/LandingPage.jsx
//
// Public-facing landing page for the Ladles of Love
// Warehouse System. Designed as a holistic introduction to
// the entire organisation – its mission, programmes, and
// impact – so that new staff and volunteers understand the
// bigger picture before they sign in.
//
// Two actions sit in the top bar at all times:
//   • Log in (for staff & scheduled volunteers)
//   • Volunteer with us (for new / unscheduled volunteers)
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useNavigate }                from 'react-router-dom';
import './LandingPage.css';

// ── Image fallback (reusable slot for all photos) ───────────
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

// ── Inline SVG icons (no external dependencies) ──────────────
const ICON_PATHS = {
  bowl:     'M3 12h18a9 9 0 0 1-18 0Zm2-3c2.2-2 13.8-2 16 0M8.5 5.5l1 2M15.5 5.5l-1 2',
  sprout:   'M12 21V12M12 12C7 12 4 8 4 4c5 0 9 3 9 8Zm0 0c5 0 9-3.5 9-8-5 0-9 3-9 8Z',
  hands:    'M7 12l-3.5 3.5a2 2 0 0 0 2.8 2.8L8 16.5M12 14l3 3a2 2 0 0 0 2.8-2.8L13 9.5 10 11M7 12l3.5-5 3.5 1 2.5 3.5',
  pin:      'M12 22s7-6.7 7-12.3A7 7 0 1 0 5 9.7C5 15.3 12 22 12 22Zm0-9.3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  shield:   'M12 22s8-3.6 8-10.2V5.6L12 3 4 5.6v6.2C4 18.4 12 22 12 22Zm-3.2-9.4 2.2 2.2 4.2-4.4',
  users:    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9 9v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M16.5 5.1a3 3 0 0 1 0 5.8M22.5 20v-1a4 4 0 0 0-3-3.87',
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
// Programmes reflect the full breadth of Ladles of Love’s work.
const PROGRAMMES = [
  {
    id: 'noc',
    icon: 'bowl',
    code: 'NOC',
    name: 'Nourish Our Children',
    description:
      'Two nutritious meals every school day for children at early childhood development centres. We deliver fresh ingredients and track every meal from supplier to plate, reaching thousands of preschools across South Africa.',
    img: '/images/noc.jpg',
  },
  {
    id: 'fts',
    icon: 'sprout',
    code: 'FTS',
    name: 'Feed the Soil',
    description:
      'Turning food that can’t be served into compost for local farms, closing the loop on food waste. Farmers return fresh vegetables to our kitchens, creating a self‑sustaining cycle of nourishment.',
    img: '/images/fts.jpg',
  },
  {
    id: 'la',
    icon: 'hands',
    code: 'LA',
    name: 'Love Activism',
    description:
      'Corporate groups, community teams, and individuals give their time at the warehouse — packing, sorting, and preparing emergency food parcels. Every hour of service directly supports a child in need.',
    img: '/images/la.jpg',
  },
  {
    id: 'dsk',
    iconSrc: '/public/icons/favicon.svg',  
    code: 'DSK',
    name: 'Dignity & Soup Kitchens',
    description:
      'Providing hot meals and essential supplies with dignity to homeless and vulnerable communities through a network of soup kitchens, ensuring no one goes to bed hungry.',
    img: '/public/images/LOVEACTIVISM.jpg',
  },
];

const STATS = [
  { value: '48M+',   label: 'Meals served since 2020' },
  { value: '200+',   label: 'Preschools supported' },
  { value: '3',      label: 'Provinces reached' },
];

// Values speak to the whole organisation, not just the warehouse.
const VALUES = [
  {
    icon: 'shield',
    text: 'Full transparency — every donation is recorded and traceable from donor to dinner plate.',
  },
  {
    icon: 'users',
    text: 'Powered by thousands of volunteers and a small, passionate team who keep the food moving.',
  },
  {
    icon: 'pin',
    text: 'Operating in the Western Cape, Northern Cape and Gauteng, with plans to grow.',
  },
];

// ── LandingPage Component ────────────────────────────────────
const LandingPage = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = 'Ladles of Love · Make a Difference';
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="lol-landing">
      <a href="#lol-signin" className="lol-skip-link">Skip to log in</a>

      {/* ── Top bar (always visible) ───────────────────────── */}
      <header className="lol-nav">
        <div className="lol-nav-inner">
          <div className="lol-nav-brand">
            {/* Logo — replace with your actual file */}
            <ImgWithFallback
              src="/public/icons/favicon.svg"
              alt="Ladles of Love"
              className="lol-nav-logo"
              fallbackText="Ladles of Love"
              fallbackPath="/public/icons/favicon.svg"
            />
            <div>
              <p className="lol-nav-title">Ladles of Love</p>
              <p className="lol-nav-sub">Together we feed the nation</p>
            </div>
          </div>
          <nav className="lol-nav-actions" aria-label="Account">
            <button
              type="button"
              className="lol-btn-text"
              onClick={() => navigate('/guest')}
            >
              Volunteer with us
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
        {/* ── Hero — full‑width background photo, strong mission ── */}
        <section className={`lol-hero${ready ? ' is-ready' : ''}`}>
          <div
            className="lol-hero-bg"
            style={{ backgroundImage: 'url(/images/hero.jpg)' }}
            aria-hidden="true"
          />
          <div className="lol-hero-overlay" />
          <div className="lol-hero-inner">
            <div className="lol-hero-copy">
              <p className="lol-eyebrow">Ladles of Love</p>
              <h1 className="lol-hero-title">
                Feeding hope, <em>nourishing communities.</em>
              </h1>
              <p className="lol-hero-lede">
                Ladles of Love is a registered non‑profit that turns compassion into action.
                From our first pot of soup in 2014 to over 48 million meals served today,
                we exist to make sure no child goes hungry and no food goes to waste.
              </p>
              <div className="lol-hero-actions">
                <button
                  type="button"
                  className="lol-btn-primary lol-btn-large"
                  onClick={() => navigate('/login')}
                >
                  Log in to the warehouse
                  <Icon name="arrow" size={18} />
                </button>
                <button
                  type="button"
                  className="lol-btn-secondary lol-btn-large"
                  onClick={() => navigate('/guest')}
                >
                  Sign up to volunteer
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

            {/* Right‑side icon / photo of the organisation */}
            <div className="lol-hero-icon">
              <ImgWithFallback
                src="/images/ladles-icon.png"
                alt="Ladles of Love icon"
                fallbackText="Organisation icon"
                fallbackPath="/public/icons/favicon.svg"
              />
            </div>
          </div>
        </section>

        {/* ── Our Programmes ──────────────────────────────────── */}
        <section className="lol-programmes" aria-labelledby="lol-programmes-title">
          <div className="lol-section-inner">
            <p className="lol-eyebrow">What we do</p>
            <h2 id="lol-programmes-title" className="lol-section-title">
              Four programmes, one mission: end hunger.
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
                      {p.iconSrc ? (
                        <img src={p.iconSrc} alt={p.code} width={22} height={22} />
                      ) : (
                        p.icon && <Icon name={p.icon} size={22} />
                      )}
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

        {/* ── Story / Impact ──────────────────────────────────── */}
        <section className="lol-story">
          <div className="lol-section-inner lol-story-grid">
            <div>
              <p className="lol-eyebrow">Our story</p>
              <h2 className="lol-section-title">
                From a single pot of soup to a nationwide movement
              </h2>
              <p>
                Danny Diliberto started Ladles of Love with one soup kitchen in 2014. What
                followed is a story of ordinary people refusing to ignore hunger. Today we
                work with over 200 preschools, community kitchens, and farms, making sure
                that food reaches the plates that need it most — and that every plate is a
                step toward a better future.
              </p>
              <p style={{ marginTop: 16 }}>
                This website is a window into the engine that drives our logistics — the
                warehouse where food is received, tracked, packed, and dispatched. If you’re
                a staff member or a registered volunteer, you can log in to manage operations
                right from here.
              </p>
            </div>

            {/* Values */}
            <div className="lol-values">
              {VALUES.map((v) => (
                <div className="lol-value" key={v.text}>
                  <span className="lol-value-icon"><Icon name={v.icon} size={20} /></span>
                  <p>{v.text}</p>
                </div>
              ))}
            </div>

            {/* Photo alongside the text */}
            <div className="lol-story-photo">
              <ImgWithFallback
                src="/images/warehouse.jpg"
                alt="Inside the Ladles of Love warehouse"
                fallbackText="Add a photo of the team or warehouse"
                fallbackPath="/images/warehouse.jpg"
              />
            </div>
          </div>
        </section>

        {/* ── Get involved / External link ───────────────────── */}
        <section className="lol-getinvolved">
          <div className="lol-section-inner lol-getinvolved-inner">
            <div>
              <h2 className="lol-section-title lol-section-title-light">
                Want to do more?
              </h2>
              <p>
                This page is the front door for staff and scheduled volunteers. If you’d
                like to donate, fundraise, or learn about our other ways to give, visit
                our main site — it’s where the full story lives.
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

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="lol-footer">
        <div className="lol-section-inner lol-footer-inner">
          <div>
            <p className="lol-footer-title">Ladles of Love</p>
            <p className="lol-footer-meta">
              Unit 4, Hewett Park, 17 Hewett Avenue, Epping 2, Cape Town
            </p>
          </div>
          <div className="lol-footer-links">
            <a href="https://www.instagram.com/ladlesoflove" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href="https://www.facebook.com/ladlesofloveZA/" target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href="https://twitter.com/ladlesoflove" target="_blank" rel="noopener noreferrer">Twitter</a>
          </div>
          <p className="lol-footer-copy">
            © Ladles of Love · Non‑Profit Organisation · Since 2014
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;