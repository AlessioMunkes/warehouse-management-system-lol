// ─────────────────────────────────────────────────────────────
// client/src/tests/GuestScreens.test.jsx
//
// What the Love Activist screens actually RENDER.
//
// Every payload below was captured verbatim from the live API on
// 2026-09-16 — not invented, and not shaped to suit the assertions.
// That matters here more than usual: three bugs in this feature were
// invisible to mocked tests because the mock agreed with the broken
// code, and two of them were date/shape defects exactly like the ones
// these fixtures encode.
//
// In particular `mySlipPayload.dispatch_date` is the plain calendar day
// the server now sends. Before the fix it was
// "2026-09-15T22:00:00.000Z" for a 2026-09-16 slip, and the packing
// screen told the volunteer the pallet went out yesterday.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../services/guestSlipAPI', () => ({
  fetchSlipPreview: vi.fn(),
  fetchSlipByCode: vi.fn(),
  claimSlipByToken: vi.fn(),
  claimSlipByCode: vi.fn(),
  claimSlipById: vi.fn(),
  fetchAvailableSlips: vi.fn(),
  fetchMySlip: vi.fn(),
  confirmItem: vi.fn(),
  flagItem: vi.fn(),
  completeSlip: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const api = await import('../services/guestSlipAPI');
const { useAuth } = await import('../context/AuthContext');

const SlipPreviewPage = (await import('../pages/SlipPreviewPage')).default;
const GuestHomePage   = (await import('../pages/GuestHomePage')).default;
const GuestPackPage   = (await import('../pages/GuestPackPage')).default;
const GuestDonePage   = (await import('../pages/GuestDonePage')).default;

// ── Live payloads, captured 2026-09-16 ────────────────────────
const preview135 = {
  id: 135, beneficiaryName: 'Masibambane Day Care', beneficiaryKind: 'ecd',
  dispatchDate: '2026-09-16', itemCount: 9, status: 'pending', isClaimed: false,
};
const preview136Empty = {
  id: 136, beneficiaryName: 'Rondebosch Soup Kitchen', beneficiaryKind: 'ecd',
  dispatchDate: '2026-09-16', itemCount: 0, status: 'pending', isClaimed: false,
};
const mySlip = {
  id: 135, status: 'in_progress', ecd_name: 'Masibambane Day Care',
  beneficiary_name: 'Masibambane Day Care', beneficiary_kind: 'ecd',
  dispatch_date: '2026-09-16', child_count: 40, cohort: 'week1',
  items: [
    { id: 207, product_name: 'Butternut', required_quantity: '1.000', unit: 'crate', packed_quantity: null, status: 'pending', flag_reason: null },
    { id: 210, product_name: 'Rice',      required_quantity: '20.000', unit: 'kg',   packed_quantity: null, status: 'pending', flag_reason: null },
  ],
};

const guest = { id: '11', firstName: 'Thabo Mokoena', role: 'guest' };

const renderAt = (path, element, routePattern) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path={routePattern} element={element} />
      <Route path="/guest" element={<div>Guest sign in</div>} />
      <Route path="/guest-home" element={<div>Guest home</div>} />
      <Route path="/guest/pack" element={<div>Packing</div>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: guest, logout: vi.fn(), refreshFromClaim: vi.fn() });
});

// ── (a) Public preview ────────────────────────────────────────
describe('(a) /slip/:token — the public preview', () => {
  it('shows who the food is for, when it goes, and how much there is', async () => {
    api.fetchSlipPreview.mockResolvedValue(preview135);
    renderAt('/slip/abc', <SlipPreviewPage />, '/slip/:token');

    expect(await screen.findByText('Masibambane Day Care')).toBeInTheDocument();
    // 2026-09-16 IS today for this fixture's run — but asserting the
    // literal word would make the test a clock. Assert it is not the
    // day before, which is what the bug produced.
    expect(screen.queryByText(/15 September/)).not.toBeInTheDocument();
    expect(screen.getByText(/9 things to pack/)).toBeInTheDocument();
  });

  it('offers one clear way in for a volunteer with no session', async () => {
    useAuth.mockReturnValue({ user: null, logout: vi.fn(), refreshFromClaim: vi.fn() });
    api.fetchSlipPreview.mockResolvedValue(preview135);
    renderAt('/slip/abc', <SlipPreviewPage />, '/slip/:token');

    expect(await screen.findByRole('button', { name: /I’ll pack this one/i })).toBeInTheDocument();
  });

  // Slip 136 is real: ECD 12 has no order lines.
  it('says an empty pallet is empty, in words, not as an empty list', async () => {
    api.fetchSlipPreview.mockResolvedValue(preview136Empty);
    renderAt('/slip/abc', <SlipPreviewPage />, '/slip/:token');

    expect(await screen.findByText('Rondebosch Soup Kitchen')).toBeInTheDocument();
    expect(screen.getByText(/Nothing listed on it yet/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing listed on this pallet yet/i)).toBeInTheDocument();
    // and never a bare zero left to interpret
    expect(screen.queryByText(/^0 things to pack$/)).not.toBeInTheDocument();
  });

  it('explains a bad code without blaming the volunteer', async () => {
    api.fetchSlipPreview.mockRejectedValue(Object.assign(new Error('That code did not match a pallet.'), { status: 404 }));
    renderAt('/slip/bad', <SlipPreviewPage />, '/slip/:token');

    expect(await screen.findByText(/could not find that pallet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in without a code/i })).toBeInTheDocument();
  });
});

// ── (b) Name entry ────────────────────────────────────────────
describe('(b) name entry', () => {
  it('asks for a name as a thank-you, not as a login', async () => {
    useAuth.mockReturnValue({ user: null, logout: vi.fn(), refreshFromClaim: vi.fn() });
    api.fetchSlipPreview.mockResolvedValue(preview135);
    renderAt('/slip/abc', <SlipPreviewPage />, '/slip/:token');

    (await screen.findByRole('button', { name: /I’ll pack this one/i })).click();

    expect(await screen.findByText(/what should we call you/i)).toBeInTheDocument();
    expect(screen.getByText(/so we can thank you/i)).toBeInTheDocument();
    // A group signs in under one name — the field must welcome that.
    expect(screen.getByText(/group/i)).toBeInTheDocument();
    // Never password/account language.
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });
});

// ── (c) Guest home ────────────────────────────────────────────
describe('(c) guest home', () => {
  it('greets by first name and lists today’s pallets', async () => {
    api.fetchMySlip.mockRejectedValue(Object.assign(new Error('none'), { status: 404 }));
    api.fetchAvailableSlips.mockResolvedValue([preview135, preview136Empty]);
    renderAt('/guest-home', <GuestHomePage />, '/guest-home');

    // NFR-19: the whole name they signed in with, not the first word.
    expect(await screen.findByText('Thabo Mokoena')).toBeInTheDocument();
    expect(screen.getByText('Masibambane Day Care')).toBeInTheDocument();
    expect(screen.getByText('Rondebosch Soup Kitchen')).toBeInTheDocument();
  });

  it('offers the typed-code route as a first-class option', async () => {
    api.fetchMySlip.mockRejectedValue(Object.assign(new Error('none'), { status: 404 }));
    api.fetchAvailableSlips.mockResolvedValue([preview135]);
    renderAt('/guest-home', <GuestHomePage />, '/guest-home');

    expect(await screen.findByLabelText(/pallet code/i)).toBeInTheDocument();
  });

  it('offers to carry on when a pallet is already in progress', async () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    api.fetchAvailableSlips.mockResolvedValue([]);
    renderAt('/guest-home', <GuestHomePage />, '/guest-home');

    expect(await screen.findByRole('button', { name: /carry on packing/i })).toBeInTheDocument();
  });

  it('says so plainly when every pallet is taken', async () => {
    api.fetchMySlip.mockRejectedValue(Object.assign(new Error('none'), { status: 404 }));
    api.fetchAvailableSlips.mockResolvedValue([]);
    renderAt('/guest-home', <GuestHomePage />, '/guest-home');

    expect(await screen.findByText(/has someone on it/i)).toBeInTheDocument();
  });
});

// ── (d) Packing ───────────────────────────────────────────────
describe('(d) the packing screen', () => {
  it('shows ONE item, not the whole pallet', async () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    expect(await screen.findByText('Item 1 of 2')).toBeInTheDocument();
    expect(screen.getAllByText('Butternut').length).toBeGreaterThan(0);
    // The second item must NOT be on screen yet — this is the whole
    // divergence from StaffSlipFlow.
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
  });

  it('keeps the volunteer’s sense of place — who it is for, and the day', async () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    expect(await screen.findByText('Masibambane Day Care')).toBeInTheDocument();
    // The date bug would render "15 September" for this 2026-09-16 slip.
    expect(screen.queryByText(/15 September/)).not.toBeInTheDocument();
  });

  it('gives a way to report a problem on the item screen', async () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    expect(await screen.findByRole('button', { name: /there’s a problem/i })).toBeInTheDocument();
  });

  it('handles an empty pallet in plain language, with a way out', async () => {
    api.fetchMySlip.mockResolvedValue({ ...mySlip, id: 136, ecd_name: 'Rondebosch Soup Kitchen', beneficiary_name: 'Rondebosch Soup Kitchen', items: [] });
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    expect(await screen.findByText(/this pallet is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/not something you have done wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pick a different pallet/i })).toBeInTheDocument();
  });

  it('offers to finish once every item is dealt with', async () => {
    api.fetchMySlip.mockResolvedValue({
      ...mySlip,
      items: mySlip.items.map((i) => ({ ...i, status: 'confirmed', packed_quantity: i.required_quantity })),
    });
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    expect(await screen.findByRole('button', { name: /finish this pallet/i })).toBeInTheDocument();
  });

  it('never leaves a dead end — help is on the screen', async () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    expect(await screen.findByText(/ask any staff member/i)).toBeInTheDocument();
  });
});

// ── (e) Contribution summary ──────────────────────────────────
describe('(e) the thank-you and contribution summary', () => {
  const summary = {
    beneficiary: 'Masibambane Day Care', beneficiaryKind: 'ecd',
    dispatchDate: '2026-09-16', childCount: 40,
    itemsPacked: 8, itemsFlagged: 1, totalItems: 9, unitsPacked: 49,
  };

  const renderDone = (state) => render(
    <MemoryRouter initialEntries={[{ pathname: '/guest/done', state }]}>
      <Routes>
        <Route path="/guest/done" element={<GuestDonePage />} />
        <Route path="/guest" element={<div>Signed out</div>} />
      </Routes>
    </MemoryRouter>
  );

  it('thanks the volunteer by name and shows the real numbers', async () => {
    renderDone({ summary });

    expect(await screen.findByText('Thabo Mokoena')).toBeInTheDocument();
    expect(screen.getByText('49')).toBeInTheDocument();      // units actually packed
    expect(screen.getByText('8')).toBeInTheDocument();       // items confirmed
    expect(screen.getByText('1')).toBeInTheDocument();       // problems reported
  });

  it('says who the food feeds, from real slip data', async () => {
    renderDone({ summary });
    expect(await screen.findByText('Masibambane Day Care')).toBeInTheDocument();
    expect(screen.getByText(/40 children/)).toBeInTheDocument();
  });

  // The brief: derive every number from actual slip data, never placeholders.
  it('invents no child count when the data has none', async () => {
    renderDone({ summary: { ...summary, childCount: null } });
    await screen.findByText('Masibambane Day Care');
    expect(screen.queryByText(/children/)).not.toBeInTheDocument();
  });

  it('ends in sign-out', async () => {
    renderDone({ summary });
    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('thanks them properly even with no summary to show', async () => {
    renderDone(undefined);
    expect(await screen.findByText(/thank you/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
