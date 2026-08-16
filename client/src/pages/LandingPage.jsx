// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { useNavigate }                 from 'react-router-dom';
import '../styles/landingpage.css';

// ── Image fallback ───────────────────────────────────────────
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

// ── Inline SVG icons (still used for menu, arrows, external) ─
const ICON_PATHS = {
  bowl:     'M3 12h18a9 9 0 0 1-18 0Zm2-3c2.2-2 13.8-2 16 0M8.5 5.5l1 2M15.5 5.5l-1 2',
  sprout:   'M12 21V12M12 12C7 12 4 8 4 4c5 0 9 3 9 8Zm0 0c5 0 9-3.5 9-8-5 0-9 3-9 8Z',
  hands:    'M7 12l-3.5 3.5a2 2 0 0 0 2.8 2.8L8 16.5M12 14l3 3a2 2 0 0 0 2.8-2.8L13 9.5 10 11M7 12l3.5-5 3.5 1 2.5 3.5',
  pin:      'M12 22s7-6.7 7-12.3A7 7 0 1 0 5 9.7C5 15.3 12 22 12 22Zm0-9.3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  arrow:    'M5 12h14M13 6l6 6-6 6',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  menu:     'M4 6h16M4 12h16M4 18h16',
  close:    'M6 6l12 12M18 6 6 18',
  heart:    'M12 21s-7.1-4.35-9.5-8.5C.7 8.9 2.2 5.3 5.7 5.2c2 0 3.6 1.2 4.6 2.7 1-1.5 2.6-2.7 4.6-2.7 3.5.1 5 3.7 3.2 7.3C19.1 16.65 12 21 12 21Z',
  info:     'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6.5v-5M12 8h.01',
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

// ── Simple swipeable image slideshow ────────────────────────
function WarehouseSlideshow({ photos }) {
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef(null);

  const next = () => setCurrent((prev) => (prev + 1) % photos.length);
  const prev = () => setCurrent((prev) => (prev - 1 + photos.length) % photos.length);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) prev();
      else next();
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="lol-slideshow"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="lol-slideshow-track" style={{ transform: `translateX(-${current * 100}%)` }}>
        {photos.map((photo, index) => (
          <div className="lol-slideshow-slide" key={index}>
            <ImgWithFallback
              src={photo.path}
              alt={photo.alt}
              fallbackText={photo.label}
              fallbackPath={photo.path}
            />
          </div>
        ))}
      </div>
      <button type="button" className="lol-slideshow-arrow lol-slideshow-arrow-left" onClick={prev} aria-label="Previous image">
        <Icon name="arrow" size={20} />
      </button>
      <button type="button" className="lol-slideshow-arrow lol-slideshow-arrow-right" onClick={next} aria-label="Next image">
        <Icon name="arrow" size={20} />
      </button>
      <div className="lol-slideshow-dots">
        {photos.map((_, index) => (
          <button
            key={index}
            type="button"
            className={`lol-slideshow-dot${current === index ? ' is-active' : ''}`}
            onClick={() => setCurrent(index)}
            aria-label={`Go to image ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Programmes ───────────────────────────────────────────────
const PROGRAMMES = [
  {
    id: 'noc',
    iconImg: '/icons/noc-icon.svg',
    name: 'Nourish Our Children',
    img: '/images/NOC.jpg',
    description:
      'Two hot meals a day for preschools across the network, packed and tracked from the moment a delivery arrives to the moment it leaves.',
  },
  {
    id: 'fts',
    iconImg: '/icons/fts-icon.svg',
    name: 'Feed the Soil',
    img: '/images/FTS.jpg',
    description:
      "Food that can't go to a plate becomes compost for local farms, and the farms send fresh vegetables back to the warehouse.",
  },
  {
    id: 'dsk',
    iconImg: '/icons/dsk-icon.svg',
    name: 'Dignity & Soup Kitchens',
    img: '/images/dignitykitchen.jpg',
    description:
      'Hot meals and essentials for homeless and vulnerable people, served with dignity at soup kitchens across the network.',
  },
  {
    id: 'bp',
    iconImg: '/icons/bp-icon.svg',
    name: 'Benevolent Packages',
    img: '/images/benevolentpackage.jpeg',
    description:
      'Emergency food parcels packed and delivered to families in crisis, with enough groceries to keep a household going for a week.',
  },
];

const CONTEXT_STATS = [
  { value: '64%', label: 'of households in South Africa don’t have reliable access to food' },
  { value: '29%', label: 'of children under five show signs of stunting' },
];

const WAREHOUSE_PHOTOS = [
  { path: '/images/warehouse.jpeg', alt: 'From our warehouse', label: 'Add photo: hands packing' },
  { path: '/images/topreschools.jpeg',  alt: 'Collected by Pre-Schools',               label: 'Add photo: pallet label' },
  { path: '/images/acrosssa.jpeg',        alt: 'Across South Africa',     label: 'Add photo: crates' },
  { path: '/images/tothelittleones.jpeg', alt: 'To the little ones who need it',       label: 'Add photo: warehouse floor' },
];

const GET_INVOLVED = [
  {
    iconImg: '/icons/aboutus-icon.svg',
    title: 'About us',
    text: 'The full story, from one pot of soup in 2014 to a network across three provinces.',
    href: 'https://ladlesoflove.org.za/about/',
  },
  {
    iconImg: '/icons/donate-icon.svg',
    title: 'Donate',
    text: 'Money, groceries or a monthly gift, every bit funds food that leaves this warehouse.',
    href: 'https://ladlesoflove.org.za/donate/',
  },
  {
    iconImg: '/icons/volunteer-icon.svg',
    title: 'Volunteer',
    text: 'Sign up for a shift packing, sorting or delivering at the Cape Town warehouse.',
    href: 'https://ladlesoflove.org.za/individual-volunteer/',
  },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [ready, setReady]       = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const firstMenuLinkRef        = useRef(null);

  useEffect(() => {
    document.title = 'Batches for Ladles · Warehouse System';
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    firstMenuLinkRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="lol-landing">
      <a href="#lol-signin" className="lol-skip-link">Skip to log in</a>

      <header className="lol-nav">
        <div className="lol-nav-inner">
          <button
            type="button"
            className="lol-menu-trigger"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Icon name="menu" size={22} />
          </button>

          <div className="lol-nav-brand">
            <img src="/images/BatchesLogo.png" alt="Batches for Ladles" className="lol-nav-logo" />
          </div>

          <nav className="lol-nav-links" aria-label="About Ladles of Love">
            <a href="https://ladlesoflove.org.za/about/" target="_blank" rel="noopener noreferrer" className="lol-nav-link">
              About us
            </a>
            <a href="https://ladlesoflove.org.za/donate/" target="_blank" rel="noopener noreferrer" className="lol-nav-link">
              Donate
            </a>
            <a href="https://ladlesoflove.org.za/individual-volunteer/" target="_blank" rel="noopener noreferrer" className="lol-nav-link">
              Volunteer
            </a>
          </nav>

          <button
            type="button"
            id="lol-signin"
            className="lol-btn-primary"
            onClick={() => navigate('/login')}
          >
            Log in
          </button>
        </div>
      </header>

      <div className={`lol-drawer-backdrop${menuOpen ? ' is-open' : ''}`} onClick={() => setMenuOpen(false)} />
      <aside
        className={`lol-drawer${menuOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="More about Ladles of Love"
      >
        <div className="lol-drawer-header">
          <p className="lol-drawer-title">More from Ladles of Love</p>
          <button type="button" className="lol-drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <Icon name="close" size={20} />
          </button>
        </div>
        <nav className="lol-drawer-links" aria-label="External links">
          {GET_INVOLVED.map((item, i) => (
            <a
              key={item.title}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="lol-drawer-link"
              ref={i === 0 ? firstMenuLinkRef : null}
            >
              <img
                src={item.iconImg}
                alt=""
                className="lol-drawer-link-icon"
              />
              <span>{item.title}</span>
              <Icon name="external" size={14} />
            </a>
          ))}
        </nav>
      </aside>

      <main>
        <section className={`lol-hero${ready ? ' is-ready' : ''}`}>
          <div
            className="lol-hero-bg"
            style={{ backgroundImage: 'url(/images/dannyheartinghero.jpg)' }}
            aria-hidden="true"
          />
          <div className="lol-hero-scrim" aria-hidden="true" />

          <div className="lol-hero-content">
            <h1 className="lol-hero-title">Feeding the soul, one meal at a time.</h1>
            <p className="lol-hero-lede">
              Every parcel that leaves this warehouse goes to a preschool, a shelter, or a
              soup kitchen across three provinces.
            </p>
            <div className="lol-hero-actions">
              <button type="button" className="lol-btn-primary lol-btn-large" onClick={() => navigate('/login')}>
                Log in
                <Icon name="arrow" size={18} />
              </button>
              <button type="button" className="lol-btn-secondary lol-btn-large" onClick={() => navigate('/guest')}>
                I'm volunteering today
              </button>
            </div>
          </div>

          <p className="lol-proof-line">
            Feeding South Africans across 3 provinces (& growing!)
          </p>
        </section>

        <section className="lol-team">
          <div className="lol-section-inner lol-team-grid">
            <div className="lol-team-photo">
              <WarehouseSlideshow photos={WAREHOUSE_PHOTOS} />
            </div>
            <div>
              <h2 className="lol-section-title">
                From Our Warehouse to Each Of Our Beneficiaries Across South Africa Every Week
              </h2>
              <p>
                We spent time with the people who run the receiving bay, the decanting and packing stations and the
                dispatch process to make your experience at our warehouses easier, clearer and more environmentally conscious. Every part of this system has been built with our staff and volunteers across all demographics in mind.
              </p>
            </div>
          </div>
        </section>

        <section className="lol-programmes" aria-labelledby="lol-programmes-title">
          <div className="lol-section-inner">
            <h2 id="lol-programmes-title" className="lol-section-title">
              Our warehouses are the center of all our programming
            </h2>
            <p>
              Every pallet that leaves our warehouses is packed, checked and sent out to the
              places where food is needed most. Volunteers often come in to help pack, and we
              manage waste collection kits from here too.
            </p>
            <div className="lol-programme-grid">
              {PROGRAMMES.map((p) => (
                <article className="lol-programme-card" key={p.id}>
                  <ImgWithFallback
                    src={p.img}
                    alt={p.name}
                    className="lol-programme-card__photo"
                    fallbackText={p.name}
                    fallbackPath={p.img}
                  />
                  <div className="lol-programme-card__body">
                    <img
                      src={p.iconImg}
                      alt=""
                      className="lol-programme-icon-img"
                    />
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Our Why ──────────────────────────────────────────── */}
        <section className="lol-story">
          <div className="lol-section-inner">
            <div className="lol-story-grid">
              <div className="lol-story-text">
                <img src="/images/black-squiggle.svg" alt="" className="lol-divider" aria-hidden="true" />
                <p className="lol-eyebrow">Our Why</p>
                <h2 className="lol-section-title">Why this system</h2>
                <p>
                  Before this system, the warehouse ran on paper and spreadsheets. Every delivery,
                  every parcel packed and every van that left the yard had to be written down by
                  hand. As the network grew from one kitchen to three provinces, it became harder
                  to see what had gone where.
                </p>
                <p>
                  This system was introduced to respond to that need. We still receive, decant, pack
                  and dispatch as efficiently as before, and now with improved record taking,
                  inventory management and impact reporting. This also means we have more time to
                  get more meals out the door.
                </p>

                <div className="lol-context-panel">
                  <p className="lol-context-lead">The need behind the numbers:</p>
                  <div className="lol-context-stats">
                    {CONTEXT_STATS.map((c) => (
                      <div className="lol-context-stat" key={c.label}>
                        <span className="lol-context-value">{c.value}</span>
                        <span className="lol-context-label">{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lol-story-photo">
                <ImgWithFallback
                  src="/images/bananas.jpeg"
                  alt="The Ladles of Love warehouse team"
                  fallbackText="Add photo: warehouse team"
                  fallbackPath="/images/bananas.jpeg"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Map ──────────────────────────────────────────────── */}
        <section className="lol-map-section" aria-labelledby="lol-map-title">
          <div className="lol-section-inner">
            <p className="lol-eyebrow">Where the food goes</p>
            <h2 id="lol-map-title" className="lol-section-title">Across three provinces</h2>
            <div className="lol-map-layout">
              <div className="lol-map-embed">
                <iframe
                  title="Ladles of Love, Cape Town warehouse"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(
                    'Unit 4, Hewett Park, 17 Hewett Avenue, Epping 2, Cape Town, South Africa'
                  )}&z=13&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="lol-map-legend">
                <p className="lol-map-legend-title">Reach across Cape Town</p>
                <ul className="lol-map-legend-list">
                  <li className="lol-map-legend-item">
                    <span className="lol-map-legend-dot" />
                    <div><strong>Epping 2 (HQ)</strong><span className="lol-map-legend-detail">Unit 4, Hewett Park</span></div>
                  </li>
                  <li className="lol-map-legend-item">
                    <span className="lol-map-legend-dot" />
                    <div><strong>Tokai</strong><span className="lol-map-legend-detail">Blue Route Mall parking lot</span></div>
                  </li>
                  <li className="lol-map-legend-item">
                    <span className="lol-map-legend-dot" />
                    <div><strong>Sea Point</strong><span className="lol-map-legend-detail">Sunset Beach parking lot</span></div>
                  </li>
                  <li className="lol-map-legend-item">
                    <span className="lol-map-legend-dot" />
                    <div><strong>Oranjezicht</strong><span className="lol-map-legend-detail">Van Riebeeck Park</span></div>
                  </li>
                  <li className="lol-map-legend-item">
                    <span className="lol-map-legend-dot" />
                    <div><strong>Rondebosch</strong><span className="lol-map-legend-detail">Outdoor community gym, Campground Road</span></div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="lol-getinvolved">
          <div className="lol-section-inner">
            <p className="lol-eyebrow lol-eyebrow--on-dark">New here?</p>
            <h2 className="lol-section-title lol-section-title-light">
              This page is for staff and volunteers signing in to work
            </h2>
            <p className="lol-getinvolved-lede">
              If you'd like to donate, volunteer or learn more about Ladles of Love, these go
              straight to our main site.
            </p>
            <div className="lol-cta-grid">
              {GET_INVOLVED.map((item) => (
                <a key={item.title} href={item.href} target="_blank" rel="noopener noreferrer" className="lol-cta-tile">
                  <img
                    src={item.iconImg}
                    alt=""
                    className="lol-cta-tile-icon"
                  />
                  <p className="lol-cta-tile-title">{item.title}</p>
                  <p className="lol-cta-tile-text">{item.text}</p>
                  <span className="lol-cta-tile-link">
                    Visit <Icon name="external" size={13} />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="lol-footer">
        <div className="lol-section-inner">
          <div className="lol-footer-top">
            <div>
              <p className="lol-footer-brand-title">Batches, in partnership with Ladles of Love</p>
              <p className="lol-footer-tagline">
                A warehouse system built with the team that receives, packs and dispatches every meal.
              </p>
            </div>
            <div>
              <p className="lol-footer-col-title">Warehouses</p>
              <p className="lol-footer-meta">Cape Town: Unit 4, Hewett Park, Epping 2</p>
              <p className="lol-footer-meta">Gauteng: Grand Central Industrial Park, Midrand</p>
            </div>
            <div>
              <p className="lol-footer-col-title">Get involved</p>
              <div className="lol-footer-links">
                <a href="https://ladlesoflove.org.za/about/" target="_blank" rel="noopener noreferrer">About us</a>
                <a href="https://ladlesoflove.org.za/donate/" target="_blank" rel="noopener noreferrer">Donate</a>
                <a href="https://ladlesoflove.org.za/individual-volunteer/" target="_blank" rel="noopener noreferrer">Volunteer</a>
              </div>
            </div>
            <div>
              <p className="lol-footer-col-title">Follow along</p>
              <div className="lol-footer-links lol-footer-links--social">
                <a href="https://www.instagram.com/ladlesoflove" target="_blank" rel="noopener noreferrer">Instagram</a>
                <a href="https://www.facebook.com/ladlesofloveZA/" target="_blank" rel="noopener noreferrer">Facebook</a>
                <a href="https://twitter.com/ladlesoflove" target="_blank" rel="noopener noreferrer">Twitter</a>
                <a href="https://za.linkedin.com/company/ladles-of-love" target="_blank" rel="noopener noreferrer">LinkedIn</a>
                <a href="https://www.tiktok.com/@ladlesoflove" target="_blank" rel="noopener noreferrer">TikTok</a>
              </div>
            </div>
          </div>
          <div className="lol-footer-bottom">
            <span>Ladles of Love is a registered South African non-profit organisation.</span>
            <span>© Ladles of Love · Warehouse Management System</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;