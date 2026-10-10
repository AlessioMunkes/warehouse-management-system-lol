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
import { render, screen, waitFor } from '@testing-library/react';
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
  releaseMySlip: vi.fn(),
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
      <Route path="/" element={<div>Landing</div>} />
      <Route path="/guest" element={<div>Guest sign in</div>} />
      <Route path="/guest-home" element={<div>Guest home</div>} />
      <Route path="/guest/pack" element={<div>Packing</div>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the guest holds nothing. A test that needs a held pallet says so.
  api.fetchMySlip.mockReset();
  api.fetchMySlip.mockRejectedValue(Object.assign(new Error('none'), { status: 404 }));
  api.releaseMySlip.mockReset();
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

// ── (a2) Exits on the preview ─────────────────────────────────
describe('(a2) /slip/:token — ways out', () => {
  it('offers Back to start to the landing page, and no Sign out, with no session', async () => {
    useAuth.mockReturnValue({ user: null, logout: vi.fn(), refreshFromClaim: vi.fn() });
    api.fetchSlipPreview.mockResolvedValue(preview135);
    renderAt('/slip/abc', <SlipPreviewPage />, '/slip/:token');

    const back = await screen.findByRole('button', { name: 'Back to start' });
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    back.click();
    expect(await screen.findByText('Landing')).toBeInTheDocument();
  });

  it('shows Sign out when the guest has a session, and Back to start goes to their pallets', async () => {
    api.fetchSlipPreview.mockResolvedValue(preview135);
    renderAt('/slip/abc', <SlipPreviewPage />, '/slip/:token');

    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'Back to start' }).click();
    expect(await screen.findByText('Guest home')).toBeInTheDocument();
  });

  it('Sign out clears the session and lands on the landing page', async () => {
    const logout = vi.fn().mockResolvedValue();
    useAuth.mockReturnValue({ user: guest, logout, refreshFromClaim: vi.fn() });
    api.fetchSlipPreview.mockResolvedValue(preview135);
    renderAt('/slip/abc', <SlipPreviewPage />, '/slip/:token');

    (await screen.findByRole('button', { name: 'Sign out' })).click();
    expect(await screen.findByText('Landing')).toBeInTheDocument();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('keeps the exits on the not-found screen too', async () => {
    api.fetchSlipPreview.mockRejectedValue(new Error('That code did not match a pallet.'));
    renderAt('/slip/bad', <SlipPreviewPage />, '/slip/:token');

    expect(await screen.findByRole('button', { name: 'Back to start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
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

    expect(await screen.findByRole('button', { name: 'Continue packing' })).toBeInTheDocument();
    // The in-progress card names the beneficiary and how far they got.
    expect(screen.getByText('Your pallet in progress: Masibambane Day Care, 0 of 2 packed')).toBeInTheDocument();
    // …and does not offer a second pallet on top of it.
    expect(screen.queryByText(/today.s pallets/i)).not.toBeInTheDocument();
  });

  it('counts confirmed and flagged items as done on the in-progress card', async () => {
    api.fetchMySlip.mockResolvedValue({
      ...mySlip,
      items: [
        { ...mySlip.items[0], status: 'confirmed' },
        { ...mySlip.items[1], status: 'flagged' },
        { ...mySlip.items[1], id: 211, status: 'pending' },
      ],
    });
    api.fetchAvailableSlips.mockResolvedValue([]);
    renderAt('/guest-home', <GuestHomePage />, '/guest-home');

    expect(await screen.findByText('Your pallet in progress: Masibambane Day Care, 2 of 3 packed')).toBeInTheDocument();
  });

  it('Continue packing goes to the packing screen', async () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    api.fetchAvailableSlips.mockResolvedValue([]);
    renderAt('/guest-home', <GuestHomePage />, '/guest-home');

    (await screen.findByRole('button', { name: 'Continue packing' })).click();
    expect(await screen.findByText('Packing')).toBeInTheDocument();
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

  it('starts the problem count at 0, not at the amount the slip asks for', async () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    api.flagItem.mockResolvedValue({});
    const { container } = renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    await screen.findByRole('heading', { level: 2, name: 'Butternut' });
    screen.getByRole('button', { name: 'One more' }).click();          // main counter now 2
    screen.getByRole('button', { name: 'There’s a problem' }).click();
    await screen.findByText(/how many did you actually pack/i);
    expect(container.querySelector('.gst-counter-value').textContent).toBe('0');

    screen.getByRole('button', { name: /there isn.t enough/i }).click();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Report it' })).toBeEnabled());
    screen.getByRole('button', { name: 'Report it' }).click();
    await waitFor(() => expect(api.flagItem).toHaveBeenCalledWith(135, 207, 'Short quantity', 0));
  });

  it('handles an empty pallet in plain language, with a way out', async () => {
    api.fetchMySlip.mockResolvedValue({ ...mySlip, id: 136, ecd_name: 'Rondebosch Soup Kitchen', beneficiary_name: 'Rondebosch Soup Kitchen', items: [] });
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    expect(await screen.findByText(/this pallet is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/not something you have done wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
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
        <Route path="/" element={<div>Landing page</div>} />
        <Route path="/login" element={<div>Employee log in</div>} />
        <Route path="/guest" element={<div>Guest log in</div>} />
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

  // A volunteer who has just finished a shift must not be handed the
  // staff login ("EMPLOYEE LOG IN - AUTHORISED PERSONNEL ONLY"). They
  // go to the landing page, which carries "I'm volunteering today".
  it('sends the volunteer to the landing page, never the staff login', async () => {
    renderDone({ summary });
    (await screen.findByRole('button', { name: /sign out/i })).click();

    expect(await screen.findByText('Landing page')).toBeInTheDocument();
    expect(screen.queryByText('Employee log in')).not.toBeInTheDocument();
  });

  it('thanks them properly even with no summary to show', async () => {
    renderDone(undefined);
    expect(await screen.findByText(/thank you/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});

// ── Session bar and sign-out with a pallet in hand ────────────
describe('the guest session bar', () => {
  const landing = () => screen.findByText('Landing');
  const signedIn = (logout) => useAuth.mockReturnValue({ user: guest, logout, refreshFromClaim: vi.fn() });

  it('shows Home and Sign out on the packing screen, and Home keeps the claim', async () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    await screen.findByRole('navigation', { name: 'Your session' });
    screen.getByRole('button', { name: 'Sign out' });
    screen.getByRole('button', { name: 'Home' }).click();
    expect(await screen.findByText('Guest home')).toBeInTheDocument();
    expect(api.releaseMySlip).not.toHaveBeenCalled();
  });

  it('shows Sign out but no Home on the home screen itself', async () => {
    api.fetchAvailableSlips.mockResolvedValue([]);
    renderAt('/guest-home', <GuestHomePage />, '/guest-home');

    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('signs out straight away when no pallet is held', async () => {
    const logout = vi.fn().mockResolvedValue();
    signedIn(logout);
    api.fetchAvailableSlips.mockResolvedValue([]);
    renderAt('/guest-home', <GuestHomePage />, '/guest-home');

    (await screen.findByRole('button', { name: 'Sign out' })).click();
    expect(await landing()).toBeInTheDocument();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(api.releaseMySlip).not.toHaveBeenCalled();
  });

  it('asks first when a pallet is held, and Keep packing changes nothing', async () => {
    const logout = vi.fn().mockResolvedValue();
    signedIn(logout);
    api.fetchMySlip.mockResolvedValue(mySlip);
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    (await screen.findByRole('button', { name: 'Sign out' })).click();
    expect(await screen.findByText(/You haven’t finished this pallet\. If you sign out, it goes back to the floor for someone else to finish\. Your packing so far is saved\./)).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();

    screen.getByRole('button', { name: 'Keep packing' }).click();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(logout).not.toHaveBeenCalled();
    expect(api.releaseMySlip).not.toHaveBeenCalled();
  });

  it('Sign out and return pallet releases first, then signs out', async () => {
    const order = [];
    signedIn(vi.fn(async () => { order.push('logout'); }));
    api.fetchMySlip.mockResolvedValue(mySlip);
    api.releaseMySlip.mockImplementation(async () => { order.push('release'); return { released: true }; });
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    (await screen.findByRole('button', { name: 'Sign out' })).click();
    (await screen.findByRole('button', { name: 'Sign out and return pallet' })).click();

    expect(await landing()).toBeInTheDocument();
    expect(order).toEqual(['release', 'logout']);
  });

  it('does not sign out silently when the return fails', async () => {
    const logout = vi.fn().mockResolvedValue();
    signedIn(logout);
    api.fetchMySlip.mockResolvedValue(mySlip);
    api.releaseMySlip.mockRejectedValue(new Error('Could not return your pallet.'));
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    (await screen.findByRole('button', { name: 'Sign out' })).click();
    (await screen.findByRole('button', { name: 'Sign out and return pallet' })).click();

    expect(await screen.findByText('Could not return your pallet.')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
    expect(screen.queryByText('Landing')).not.toBeInTheDocument();
    // still there to try again, or to keep packing
    expect(screen.getByRole('button', { name: 'Sign out and return pallet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep packing' })).toBeInTheDocument();
  });

  describe('when the held-pallet check fails', () => {
    const failCheck = () => {
      api.fetchMySlip.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
      api.fetchAvailableSlips.mockResolvedValue([]);
      renderAt('/guest-home', <GuestHomePage />, '/guest-home');
    };

    it('offers Try again and Sign out anyway, with the staff note, and does not sign out yet', async () => {
      const logout = vi.fn().mockResolvedValue();
      signedIn(logout);
      failCheck();

      (await screen.findByRole('button', { name: 'Sign out' })).click();
      expect(await screen.findByText('We could not check your pallet.')).toBeInTheDocument();
      expect(screen.getByText('If you were packing a pallet, staff can return it to the floor.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign out anyway' })).toBeInTheDocument();
      expect(logout).not.toHaveBeenCalled();
    });

    it('Sign out anyway signs out without releasing', async () => {
      const logout = vi.fn().mockResolvedValue();
      signedIn(logout);
      failCheck();

      (await screen.findByRole('button', { name: 'Sign out' })).click();
      (await screen.findByRole('button', { name: 'Sign out anyway' })).click();

      expect(await screen.findByText('Landing')).toBeInTheDocument();
      expect(logout).toHaveBeenCalledTimes(1);
      expect(api.releaseMySlip).not.toHaveBeenCalled();
    });

    it('Try again re-checks, and carries on to the confirm if a pallet is held', async () => {
      const logout = vi.fn().mockResolvedValue();
      signedIn(logout);
      failCheck();

      (await screen.findByRole('button', { name: 'Sign out' })).click();
      await screen.findByRole('button', { name: 'Try again' });
      api.fetchMySlip.mockReset();
      api.fetchMySlip.mockResolvedValue(mySlip);
      screen.getByRole('button', { name: 'Try again' }).click();

      expect(await screen.findByRole('button', { name: 'Sign out and return pallet' })).toBeInTheDocument();
      expect(screen.queryByText('We could not check your pallet.')).not.toBeInTheDocument();
      expect(logout).not.toHaveBeenCalled();
    });
  });
});

// ── Return a pallet from the home screen ──────────────────────
describe('Return this pallet (guest home)', () => {
  const renderHeld = () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    api.fetchAvailableSlips.mockResolvedValue([]);
    renderAt('/guest-home', <GuestHomePage />, '/guest-home');
  };

  it('asks first, and Keep it changes nothing', async () => {
    renderHeld();
    (await screen.findByRole('button', { name: 'Return this pallet' })).click();

    expect(await screen.findByText('Return this pallet to the floor? Your packing so far is saved.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Keep it' }).click();

    expect(await screen.findByRole('button', { name: 'Continue packing' })).toBeInTheDocument();
    expect(api.releaseMySlip).not.toHaveBeenCalled();
    expect(screen.getByText(/Your pallet in progress/)).toBeInTheDocument();
  });

  it('Return pallet releases, then shows the pallet list and code box again', async () => {
    renderHeld();
    api.releaseMySlip.mockResolvedValue({ released: true });
    (await screen.findByRole('button', { name: 'Return this pallet' })).click();

    // the pallet just returned is on the list the page reads next
    api.fetchAvailableSlips.mockResolvedValue([preview135]);
    (await screen.findByRole('button', { name: 'Return pallet' })).click();

    expect(await screen.findByText('Masibambane Day Care')).toBeInTheDocument();
    expect(screen.getByLabelText('Pallet code')).toBeInTheDocument();
    expect(screen.queryByText(/Your pallet in progress/)).not.toBeInTheDocument();
    expect(api.releaseMySlip).toHaveBeenCalledTimes(1);
  });

  it('shows the error and keeps the pallet when the return fails', async () => {
    renderHeld();
    api.releaseMySlip.mockRejectedValue(new Error('Could not return your pallet.'));
    (await screen.findByRole('button', { name: 'Return this pallet' })).click();
    (await screen.findByRole('button', { name: 'Return pallet' })).click();

    expect(await screen.findByText('Could not return your pallet.')).toBeInTheDocument();
    expect(screen.getByText(/Your pallet in progress/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Return pallet' })).toBeInTheDocument();
  });
});

// ── The packing screen, in the worker's guided look ───────────
describe('the packing screen (guided look)', () => {
  const three = {
    ...mySlip,
    items: [
      { id: 207, product_name: 'Butternut', required_quantity: '1.000', unit: 'crate', packed_quantity: null, status: 'pending', flag_reason: null },
      { id: 210, product_name: 'Rice', required_quantity: '20.000', unit: 'kg', packed_quantity: null, status: 'pending', flag_reason: null },
      { id: 211, product_name: 'Beans', required_quantity: '5.000', unit: 'kg', packed_quantity: null, status: 'pending', flag_reason: null },
    ],
  };

  it('shows the pallet as the heading, an n / n progress bar and the item in a row', async () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    const { container } = renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    expect(await screen.findByRole('heading', { level: 1, name: 'Masibambane Day Care' })).toBeInTheDocument();
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '0 of 2 items done' })).toBeInTheDocument();
    expect(container.querySelector('.gst-list .gst-row')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Butternut' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Packed it' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'There’s a problem' })).toBeInTheDocument();
    // two items is "next" territory only if there is somewhere to go
    expect(screen.getByRole('navigation', { name: 'Move between items' })).toBeInTheDocument();
  });

  it('has no "To do" pill on the item in front of them', async () => {
    api.fetchMySlip.mockResolvedValue(mySlip);
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    await screen.findByRole('heading', { level: 2, name: 'Butternut' });
    expect(screen.queryByText('To do')).not.toBeInTheDocument();
  });

  it('has no previous / next when only one item is left', async () => {
    api.fetchMySlip.mockResolvedValue({ ...mySlip, items: [mySlip.items[0]] });
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    await screen.findByRole('heading', { level: 2, name: 'Butternut' });
    expect(screen.queryByRole('navigation', { name: 'Move between items' })).not.toBeInTheDocument();
  });

  it('steps to the next and previous item still to do, without saving anything', async () => {
    api.fetchMySlip.mockResolvedValue(three);
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    await screen.findByRole('heading', { level: 2, name: 'Butternut' });
    expect(screen.getByRole('button', { name: 'Previous item' })).toBeDisabled();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    screen.getByRole('button', { name: 'Next item' }).click();
    expect(await screen.findByRole('heading', { level: 2, name: 'Rice' })).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    screen.getByRole('button', { name: 'Previous item' }).click();
    expect(await screen.findByRole('heading', { level: 2, name: 'Butternut' })).toBeInTheDocument();
    expect(api.confirmItem).not.toHaveBeenCalled();
  });

  it('packing a stepped-to item saves that item, then moves on to the one after it', async () => {
    api.fetchMySlip.mockResolvedValue(three);
    api.confirmItem.mockImplementation(async () => {
      // the server now has Rice done
      api.fetchMySlip.mockResolvedValue({
        ...three,
        items: three.items.map((i) => (i.id === 210 ? { ...i, status: 'confirmed', packed_quantity: '20.000' } : i)),
      });
      return {};
    });
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    await screen.findByRole('heading', { level: 2, name: 'Butternut' });
    screen.getByRole('button', { name: 'Next item' }).click();
    await screen.findByRole('heading', { level: 2, name: 'Rice' });
    screen.getByRole('button', { name: 'Packed it' }).click();

    expect(await screen.findByRole('heading', { level: 2, name: 'Beans' })).toBeInTheDocument();
    expect(api.confirmItem).toHaveBeenCalledWith(135, 210, 20);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('confirming the last item after skipping ahead wraps to the ones still pending, not the all-done screen', async () => {
    api.fetchMySlip.mockResolvedValue(three);
    api.confirmItem.mockImplementation(async () => {
      api.fetchMySlip.mockResolvedValue({
        ...three,
        items: three.items.map((i) => (i.id === 211 ? { ...i, status: 'confirmed', packed_quantity: '5.000' } : i)),
      });
      return {};
    });
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    await screen.findByRole('heading', { level: 2, name: 'Butternut' });
    screen.getByRole('button', { name: 'Next item' }).click();
    await screen.findByRole('heading', { level: 2, name: 'Rice' });
    screen.getByRole('button', { name: 'Next item' }).click();
    await screen.findByRole('heading', { level: 2, name: 'Beans' });
    screen.getByRole('button', { name: 'Packed it' }).click();

    // Beans was last in the list; Butternut and Rice are still to do.
    expect(await screen.findByRole('heading', { level: 2, name: 'Butternut' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();   // progress: one of three done
    expect(screen.queryByText(/that.s everything/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish this pallet' })).not.toBeInTheDocument();
  });

  it('keeps "Item n of n" and the previous / next count in step after items are done', async () => {
    const mk = (id, name, status) => ({ id, product_name: name, required_quantity: '1.000', unit: 'each', packed_quantity: status === 'pending' ? null : '1.000', status, flag_reason: null });
    api.fetchMySlip.mockResolvedValue({
      ...mySlip,
      items: [
        mk(1, 'Oats', 'confirmed'), mk(2, 'Milk', 'flagged'), mk(3, 'Tea', 'confirmed'),
        mk(4, 'Butternut', 'pending'), mk(5, 'Rice', 'pending'), mk(6, 'Beans', 'pending'),
      ],
    });
    renderAt('/guest/pack', <GuestPackPage />, '/guest/pack');

    await screen.findByRole('heading', { level: 2, name: 'Butternut' });
    expect(screen.getByText('Item 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    screen.getByRole('button', { name: 'Next item' }).click();
    await screen.findByRole('heading', { level: 2, name: 'Rice' });
    screen.getByRole('button', { name: 'Next item' }).click();
    await screen.findByRole('heading', { level: 2, name: 'Beans' });

    expect(screen.getByText('Item 3 of 3')).toBeInTheDocument();
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '3 of 6 items done' })).toBeInTheDocument();
  });
});
