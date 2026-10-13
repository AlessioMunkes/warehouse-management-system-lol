// ─────────────────────────────────────────────────────────────
// client/src/tests/LegalPages.test.jsx
//
// The Privacy Policy and Terms of Service are what Google's consent
// screen links to, so they must open for someone who is not signed in.
// These render the real routes with no session, and check the links
// that lead to them from the landing and sign-in pages.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ROUTES } from '../routes/routeTable';
import { LEGAL } from '../routes/paths';
import { LEGAL_DETAILS } from '../features/legal/legalDetails';
import indexHtml from '../../index.html?raw';

// jsdom has no IntersectionObserver, which the landing page uses to reveal
// sections as they scroll in.
class NoObserver { observe() {} unobserve() {} disconnect() {} }
window.IntersectionObserver = NoObserver;
globalThis.IntersectionObserver = NoObserver;

// Nobody is signed in: the session check is refused, as it is for a
// visitor who has never logged in.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ message: 'Not authenticated' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  )));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const { default: App } = await import('../App');

const openApp = (path) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

describe('legal pages route table', () => {
  it('serves /privacy and /terms as public routes', () => {
    for (const path of ['/privacy', '/terms']) {
      const route = ROUTES.find((r) => r.path === path);
      expect(route, `${path} is missing from the route table`).toBeTruthy();
      expect(route.roles, `${path} must not require a role`).toBeNull();
    }
    expect(LEGAL).toEqual({ privacy: '/privacy', terms: '/terms' });
  });
});

describe('legal pages without signing in', () => {
  it('shows the Privacy Policy', async () => {
    openApp('/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'How Gmail is used' })).toBeInTheDocument();
    expect(screen.getByText(/never reads, lists, searches or deletes mail/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /log in/i })).not.toBeInTheDocument();
  });

  it('shows the Terms of Service', async () => {
    openApp('/terms');
    expect(await screen.findByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Acceptable use' })).toBeInTheDocument();
  });

  it('puts the same contact details on both pages', async () => {
    const { unmount } = openApp('/privacy');
    await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' });
    expect(screen.getByText(`Contact: ${LEGAL_DETAILS.contactName}`)).toBeInTheDocument();
    expect(screen.getByText(`Information Officer: ${LEGAL_DETAILS.informationOfficer}`)).toBeInTheDocument();
    unmount();

    openApp('/terms');
    await screen.findByRole('heading', { level: 1, name: 'Terms of Service' });
    expect(screen.getByText(`Contact: ${LEGAL_DETAILS.contactName}`)).toBeInTheDocument();
  });

  it('links each page to the other and back home', async () => {
    openApp('/privacy');
    await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' });
    const nav = screen.getByRole('navigation', { name: 'Legal pages' });
    expect(within(nav).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute('href', '/');
  });
});

describe('links to the legal pages', () => {
  it('are in the landing page footer', async () => {
    openApp('/');
    const footer = (await screen.findByRole('contentinfo'));
    expect(within(footer).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(within(footer).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  });

  it('are on the login page', async () => {
    openApp('/login');
    expect(await screen.findByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  });
});

describe('links to the legal pages from the guest sign-in and the bare HTML', () => {
  it('are on the guest sign-in page', async () => {
    openApp('/guest');
    expect(await screen.findByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  });

  // For a reader that does not run the app (a crawler, Google's review).
  it('are plain links in index.html', () => {
    expect(indexHtml).toContain('<a href="/privacy">Privacy Policy</a>');
    expect(indexHtml).toContain('<a href="/terms">Terms of Service</a>');
  });
});

describe('no dashes in the pages', () => {
  it('uses no em dashes', async () => {
    const { unmount } = openApp('/privacy');
    await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' });
    expect(document.body.textContent).not.toContain('—');
    unmount();
    openApp('/terms');
    await screen.findByRole('heading', { level: 1, name: 'Terms of Service' });
    expect(document.body.textContent).not.toContain('—');
  });
});

