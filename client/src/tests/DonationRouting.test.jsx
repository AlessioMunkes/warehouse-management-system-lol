// ─────────────────────────────────────────────────────────────
// src/tests/DonationRouting.test.jsx
//
// The donation intake routes spent a while sitting outside any role
// gate behind a "TEMP — move back before demo" comment. Nothing in
// the build or the linter notices an unguarded route, so this pins
// the gate instead: DONATION_INTAKE_ROLES gets in, everyone else is
// bounced, and the client list stays in step with RECEIVERS_UP in
// server/src/routes/donation.routes.js.
//
// The server route is the real control — this only stops a worker
// being shown a form the API would refuse. Both need to hold.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import { DONATIONS, STAFF } from '../routes/paths';
import { routeById } from '../routes/routeTable';

// The guard the real intake route uses (routes/routeTable.js).
const DONATION_INTAKE_ROLES = routeById('donationIntake').roles;

const mockAuth = { value: { user: null, isLoading: false } };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth.value,
}));

// Stand-ins for the real pages: this test is about who gets through
// the gate, not what the intake form renders.
function renderAt(path, user) {
  mockAuth.value = { user, isLoading: false };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute roles={DONATION_INTAKE_ROLES} />}>
          <Route path={DONATIONS.new}    element={<p>INTAKE FORM</p>} />
          <Route path={DONATIONS.review} element={<p>REVIEW PAGE</p>} />
        </Route>
        <Route path={STAFF.home}   element={<p>TASK DASHBOARD</p>} />
        <Route path="/manager"     element={<p>MANAGER HOME</p>} />
        <Route path="/admin"       element={<p>ADMIN HOME</p>} />
        <Route path="/login"       element={<p>LOGIN</p>} />
        <Route path="/guest-home"  element={<p>GUEST HOME</p>} />
        <Route path="*"            element={<Navigate to="/login" replace />} />
      </Routes>
    </MemoryRouter>
  );
}

const user = (role) => ({ id: 1, firstName: 'T', lastName: 'U', role });

beforeEach(() => vi.clearAllMocks());

describe('donation intake route guarding', () => {
  it.each(DONATION_INTAKE_ROLES)('lets %s reach the intake form', (role) => {
    renderAt(DONATIONS.new, user(role));
    expect(screen.getByText('INTAKE FORM')).toBeInTheDocument();
  });

  it.each(DONATION_INTAKE_ROLES)('lets %s reach the review page', (role) => {
    renderAt(DONATIONS.review, user(role));
    expect(screen.getByText('REVIEW PAGE')).toBeInTheDocument();
  });

  it('bounces an anonymous visitor to login', () => {
    renderAt(DONATIONS.new, null);
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('INTAKE FORM')).not.toBeInTheDocument();
  });

  // This was 'bounces finance', a role the system no longer has. There
  // is no signed-in staff role left to bounce — intake is open to all
  // three — so the list itself is what is worth pinning. Narrow it and
  // the .each blocks above start exercising the gate.
  // Floor work: each role sees only its own screens, so intake is the
  // warehouse worker's alone. Admins correct donations on the
  // Classification Queue.
  it('is open to warehouse staff only', () => {
    expect([...DONATION_INTAKE_ROLES]).toEqual(['warehouse_worker']);
  });

  it('sends an admin to their own dashboard', () => {
    renderAt(DONATIONS.new, user('admin'));
    expect(screen.getByText('ADMIN HOME')).toBeInTheDocument();
    expect(screen.queryByText('INTAKE FORM')).not.toBeInTheDocument();
  });

  // Taken out of the manager's view on request: an old link or bookmark
  // lands them on their own dashboard instead of the intake form.
  it('sends a manager to their own dashboard', () => {
    renderAt(DONATIONS.new, user('manager'));
    expect(screen.getByText('MANAGER HOME')).toBeInTheDocument();
    expect(screen.queryByText('INTAKE FORM')).not.toBeInTheDocument();
  });

  it('bounces a guest to the guest home', () => {
    renderAt(DONATIONS.new, user('guest'));
    expect(screen.getByText('GUEST HOME')).toBeInTheDocument();
  });

  it('holds the route closed while the session check is still in flight', () => {
    mockAuth.value = { user: null, isLoading: true };
    render(
      <MemoryRouter initialEntries={[DONATIONS.new]}>
        <Routes>
          <Route element={<ProtectedRoute roles={DONATION_INTAKE_ROLES} />}>
            <Route path={DONATIONS.new} element={<p>INTAKE FORM</p>} />
          </Route>
          <Route path="/login" element={<p>LOGIN</p>} />
        </Routes>
      </MemoryRouter>
    );
    // Neither open nor bounced — a redirect here would kick a valid
    // session out on every refresh.
    expect(screen.queryByText('INTAKE FORM')).not.toBeInTheDocument();
    expect(screen.queryByText('LOGIN')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('stays within RECEIVERS_UP on the server', () => {
    // server/src/routes/donation.routes.js:12 allows worker, manager and
    // admin. The screen is narrower on purpose (managers do not log
    // donations from here); it must never be wider than the server.
    const serverRoles = ['admin', 'manager', 'warehouse_worker'];
    for (const role of DONATION_INTAKE_ROLES) expect(serverRoles).toContain(role);
  });
});
