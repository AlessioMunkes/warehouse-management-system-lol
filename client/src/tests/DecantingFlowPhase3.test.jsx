import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/decantingAPI', () => ({
  calculateDecantingPlan: vi.fn(),
  recordDecanting: vi.fn(),
}));

vi.mock('../features/decanting/components/DecantingSheetPDF', () => ({
  default: () => null,
}));

const { default: DecantingFlow } = await import('../features/decanting/components/DecantingFlow');
const decantingAPI = await import('../services/decantingAPI');

const PRODUCTS = [
  { id: 7, name: 'Maize Meal', weight_kg: 50 },
  { id: 8, name: 'Sugar Beans', weight_kg: 25 },
  { id: 9, name: 'Cooking Oil', weight_kg: 112 },
  { id: 10, name: 'Chicken Pieces (5kg)', weight_kg: 5 },
];

const plan = ({ bags = { '5kg': 1, '2kg': 1, '500g': 1 }, partialBag = null, surplusKg = 0.02, shortfallKg = 0.02 } = {}) => ({
  plans: [{
    productId: 7,
    bags,
    totalBags: Object.values(bags).reduce((a, b) => a + b, 0) + (partialBag ? 1 : 0),
    packedKg: 7.52,
    surplusKg,
    shortfallKg,
    partialBag,
    isBulkLimited: false,
  }],
});

const mockCalculateBySizes = () => {
  decantingAPI.calculateDecantingPlan.mockImplementation(async (payload) => {
    const sizes = payload.selectedSizes.join(',');
    if (sizes === '10,5,2,1,0.5') return plan({ bags: { '5kg': 1, '2kg': 1, '500g': 1 } });
    if (sizes === '10') return plan({ bags: { '10kg': 1 }, surplusKg: 0, shortfallKg: 0 });
    if (sizes === '10,5') return plan({ bags: { '10kg': 1, '5kg': 1 }, surplusKg: 0, shortfallKg: 0 });
    if (sizes === '5') return plan({ bags: { '5kg': 1 }, surplusKg: 0, shortfallKg: 0 });
    return plan();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCalculateBySizes();
  try { localStorage.clear(); } catch { /* ignore */ }
});

const openWorkPage = async (user, productId = '7') => {
  render(<DecantingFlow products={PRODUCTS} />);
  await user.selectOptions(screen.getByLabelText('Product'), productId);
  await user.click(screen.getByRole('button', { name: 'Next' }));
};

const enterWeights = async (user, { weighed = '7.52', required = '7.52' } = {}) => {
  if (weighed) await user.type(screen.getByLabelText('Bulk amount on the scale, in kilograms'), weighed);
  if (required) await user.type(screen.getByLabelText(/Kilograms the centres need/), required);
};

const waitForRecommendation = async () => {
  await waitFor(() => expect(
    decantingAPI.calculateDecantingPlan.mock.calls.some(([payload]) => (
      payload.selectedSizes.join(',') === '10,5,2,1,0.5'
    ))
  ).toBe(true));
};

const findCallBySizes = (sizes) => decantingAPI.calculateDecantingPlan.mock.calls
  .find(([payload]) => payload.selectedSizes.join(',') === sizes)?.[0];

const chooseCustomPlan = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Choose my own plan' }));
};

const openBagPlanPanel = async () => {
  await waitForRecommendation();
};

describe('DecantingFlow recommended and custom bag plans', () => {
  it('initial render shows no Still needed error', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);

    expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument();
  });

  it('clicking Save decanted amount with missing fields shows validation', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);

    await user.click(screen.getByRole('button', { name: 'Save decanted amount' }));

    expect(screen.getByText(/Still needed/)).toBeInTheDocument();
    expect(screen.getByText(/Enter the weight shown on the scale/)).toBeInTheDocument();
  });

  it('valid inputs trigger recommended calculation with all supported sizes', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user);

    await waitForRecommendation();
    expect(findCallBySizes('10,5,2,1,0.5')).toBeTruthy();
  });

  it('112kg Cooking Oil recommended request uses the backend calculate contract and can become active', async () => {
    const user = userEvent.setup();
    await openWorkPage(user, '9');
    await enterWeights(user, { weighed: '112', required: '12' });

    await waitFor(() => expect(
      decantingAPI.calculateDecantingPlan.mock.calls.some(([payload]) => (
        payload.selectedSizes.join(',') === '10,5,2,1,0.5'
        && payload.items[0].productId === 9
        && payload.items[0].productName === 'Cooking Oil'
        && payload.items[0].actualBulkKg === 112
        && payload.items[0].requiredKg === 12
        && payload.items[0].wastageKg === 0
      ))
    ).toBe(true));

    expect(screen.getByText('Recommended bag plan')).toBeInTheDocument();
    expect(screen.queryByText(/We couldn't create a recommended bag plan/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use recommended plan' }));
    expect(screen.getByRole('button', { name: 'I have filled them' })).toBeInTheDocument();
    expect(screen.queryByText(/Still needed: the bag plan/)).not.toBeInTheDocument();
  });

  it('112kg Cooking Oil custom 10kg plus 2kg sends [10,2], becomes active, and clears bag-plan validation', async () => {
    const user = userEvent.setup();
    await openWorkPage(user, '9');
    await enterWeights(user, { weighed: '112', required: '12' });
    await waitForRecommendation();
    decantingAPI.calculateDecantingPlan.mockClear();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));
    await user.click(screen.getByRole('button', { name: '2kg' }));
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));

    await waitFor(() => expect(
      decantingAPI.calculateDecantingPlan.mock.calls.some(([payload]) => (
        payload.selectedSizes.join(',') === '10,2'
        && payload.items[0].productId === 9
        && payload.items[0].productName === 'Cooking Oil'
        && payload.items[0].actualBulkKg === 112
        && payload.items[0].requiredKg === 12
        && payload.items[0].wastageKg === 0
      ))
    ).toBe(true));

    expect(await screen.findByText('Custom plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I have filled them' })).toBeInTheDocument();
    expect(screen.queryByText(/We couldn't calculate that bag plan/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Still needed: the bag plan/)).not.toBeInTheDocument();
  });

  it('exact Chicken Pieces 12kg custom 10kg plus 2kg succeeds and clears any custom error', async () => {
    const user = userEvent.setup();
    decantingAPI.calculateDecantingPlan.mockImplementation(async (payload) => {
      if (payload.selectedSizes.join(',') === '10,2') {
        return plan({ bags: { '10kg': 1, '2kg': 1 }, surplusKg: 0, shortfallKg: 0 });
      }
      return plan({ surplusKg: 0, shortfallKg: 0 });
    });
    await openWorkPage(user, '10');
    await enterWeights(user, { weighed: '12', required: '12' });
    await waitForRecommendation();
    decantingAPI.calculateDecantingPlan.mockClear();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));
    await user.click(screen.getByRole('button', { name: '2kg' }));
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));

    await waitFor(() => expect(
      decantingAPI.calculateDecantingPlan.mock.calls.some(([payload]) => (
        payload.selectedSizes.join(',') === '10,2'
        && payload.items[0].productId === 10
        && payload.items[0].productName === 'Chicken Pieces (5kg)'
        && payload.items[0].actualBulkKg === 12
        && payload.items[0].requiredKg === 12
        && payload.items[0].wastageKg === 0
      ))
    ).toBe(true));

    expect(await screen.findByText('Custom plan')).toBeInTheDocument();
    expect(screen.getAllByText(/^bags? of 10kg$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^bags? of 2kg$/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'I have filled them' })).toBeInTheDocument();
    expect(screen.queryByText(/couldn't calculate that custom bag plan/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Still needed: the bag plan/)).not.toBeInTheDocument();
  });

  it('recommended plan displays in the existing bag-plan area', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user);
    await openBagPlanPanel(user);

    expect(screen.getByText('Recommended bag plan')).toBeInTheDocument();
    expect(screen.getByText(/^bags? of 5kg$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use recommended plan' })).toBeInTheDocument();
  });

  it('clicking Use recommended plan makes it active and satisfies the bag-plan requirement', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user);
    await openBagPlanPanel(user);

    await user.click(screen.getByRole('button', { name: 'Use recommended plan' }));

    expect(screen.getByRole('button', { name: 'I have filled them' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save decanted amount' }));
    expect(screen.queryByText(/Still needed: the bag plan/)).not.toBeInTheDocument();
  });

  it('five custom bag toggles remain visible and interactive', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user);
    await waitForRecommendation();
    await chooseCustomPlan(user);
    const group = screen.getByRole('group', { name: 'Bag sizes' });

    for (const size of ['10kg', '5kg', '2kg', '1kg', '500g']) {
      const button = within(group).getByRole('button', { name: size });
      expect(button).toHaveClass('bag-size-toggle');
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('clicking 10kg selects it and clicking it again deselects it', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user);
    await waitForRecommendation();
    await chooseCustomPlan(user);

    const tenKg = screen.getByRole('button', { name: '10kg' });
    await user.click(tenKg);
    expect(tenKg).toHaveAttribute('aria-pressed', 'true');
    await user.click(tenKg);
    expect(tenKg).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking 5kg after 10kg keeps both selected', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user);
    await waitForRecommendation();
    await chooseCustomPlan(user);

    const tenKg = screen.getByRole('button', { name: '10kg' });
    const fiveKg = screen.getByRole('button', { name: '5kg' });
    await user.click(tenKg);
    await user.click(fiveKg);

    expect(tenKg).toHaveAttribute('aria-pressed', 'true');
    expect(fiveKg).toHaveAttribute('aria-pressed', 'true');
  });

  it('selecting 10kg only selects it and does not calculate yet', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user, { weighed: '10', required: '10' });
    await waitForRecommendation();
    decantingAPI.calculateDecantingPlan.mockClear();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));

    expect(screen.getByRole('button', { name: '10kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Use selected bag sizes' })).toBeInTheDocument();
    expect(findCallBySizes('10')).toBeFalsy();
    expect(screen.queryByRole('button', { name: /Bag this many/ })).not.toBeInTheDocument();
  });

  it('clicking a bag-size toggle does not submit or advance while custom calculation is pending', async () => {
    const user = userEvent.setup();
    let resolveTen;
    decantingAPI.calculateDecantingPlan.mockImplementation((payload) => {
      const sizes = payload.selectedSizes.join(',');
      if (sizes === '10') {
        return new Promise((resolve) => { resolveTen = () => resolve(plan({ bags: { '10kg': 1 }, surplusKg: 0, shortfallKg: 0 })); });
      }
      return Promise.resolve(plan({ surplusKg: 0, shortfallKg: 0 }));
    });
    await openWorkPage(user);
    await enterWeights(user, { weighed: '12', required: '12' });
    await waitForRecommendation();
    decantingAPI.calculateDecantingPlan.mockClear();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));

    expect(findCallBySizes('10')).toBeFalsy();
    expect(decantingAPI.recordDecanting).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '10kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Bag this many/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I have filled them' })).not.toBeInTheDocument();
    expect(screen.queryByText('Custom plan')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));
    await waitFor(() => expect(findCallBySizes('10')).toBeTruthy());
    resolveTen();
    expect(await screen.findByText('Custom plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I have filled them' })).toBeInTheDocument();
  });

  it('selecting 10kg and 5kg sends [10,5] after using selected sizes', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user, { weighed: '15', required: '15' });
    await waitForRecommendation();
    decantingAPI.calculateDecantingPlan.mockClear();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));
    await user.click(screen.getByRole('button', { name: '5kg' }));
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));

    await waitFor(() => expect(findCallBySizes('10,5')).toBeTruthy());
    expect(await screen.findByText('Custom plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I have filled them' })).toBeInTheDocument();
  });

  it('genuine custom calculation failure keeps the recommendation available', async () => {
    const user = userEvent.setup();
    decantingAPI.calculateDecantingPlan.mockImplementation(async (payload) => {
      if (payload.selectedSizes.join(',') === '10') throw new Error('boom');
      return plan({ surplusKg: 0, shortfallKg: 0 });
    });
    await openWorkPage(user);
    await enterWeights(user, { weighed: '10', required: '10' });
    await waitForRecommendation();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));
    expect(screen.queryByText("We couldn't calculate that custom bag plan. Your recommended plan is still available.")).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));

    expect(await screen.findByText("We couldn't calculate that custom bag plan. Your recommended plan is still available.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'I have filled them' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bag this many/ })).not.toBeInTheDocument();

    expect(screen.getByText('Recommended bag plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use recommended plan' })).toBeInTheDocument();
  });

  it('recommended plan remains visible when custom sizes are selected', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user, { weighed: '15', required: '15' });
    await waitForRecommendation();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));

    expect(await screen.findByText('Custom plan')).toBeInTheDocument();
    expect(screen.getByText('Recommended bag plan')).toBeInTheDocument();
  });

  it('custom shortfall is displayed as a valid plan result', async () => {
    const user = userEvent.setup();
    decantingAPI.calculateDecantingPlan.mockImplementation(async (payload) => {
      if (payload.selectedSizes.join(',') === '10') {
        return plan({ bags: { '10kg': 1 }, surplusKg: 0, shortfallKg: 2 });
      }
      return plan({ bags: { '10kg': 1, '2kg': 1 }, surplusKg: 0, shortfallKg: 0 });
    });
    await openWorkPage(user, '9');
    await enterWeights(user, { weighed: '112', required: '12' });
    await waitForRecommendation();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));

    expect(await screen.findByText('Custom plan')).toBeInTheDocument();
    expect(screen.getAllByText(/^bags? of 10kg$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2kg still needs to be packed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I have filled them' })).toBeInTheDocument();
    expect(screen.queryByText(/couldn't calculate/)).not.toBeInTheDocument();
  });

  it('deselecting all custom sizes clears the custom plan and preserves the recommendation', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user, { weighed: '10', required: '10' });
    await waitForRecommendation();
    await chooseCustomPlan(user);
    await user.click(screen.getByRole('button', { name: '10kg' }));
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));
    await screen.findByText('Custom plan');

    await user.click(screen.getByRole('button', { name: 'Bulk amount10 kg bulk · 10 kg needed' }));
    await user.click(screen.getByRole('button', { name: '10kg' }));

    expect(await screen.findByText('Recommended bag plan')).toBeInTheDocument();
    expect(screen.queryByText('Custom plan')).not.toBeInTheDocument();
  });

  it('input changes invalidate the old active plan and refresh recommendation', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user, { weighed: '10', required: '10' });
    await openBagPlanPanel(user);
    await user.click(screen.getByRole('button', { name: 'Use recommended plan' }));
    decantingAPI.calculateDecantingPlan.mockClear();

    await user.click(screen.getByRole('button', { name: 'Bulk amount10 kg bulk · 10 kg needed' }));
    await user.clear(screen.getByLabelText(/Kilograms the centres need/));
    await user.type(screen.getByLabelText(/Kilograms the centres need/), '11');

    await waitFor(() => expect(findCallBySizes('10,5,2,1,0.5')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'I have filled them' })).not.toBeInTheDocument();
  });

  it('custom selection changes recalculate the custom plan', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user, { weighed: '15', required: '15' });
    await waitForRecommendation();
    decantingAPI.calculateDecantingPlan.mockClear();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));
    expect(findCallBySizes('10')).toBeFalsy();
    await user.click(screen.getByRole('button', { name: '5kg' }));
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));

    await waitFor(() => expect(findCallBySizes('10,5')).toBeTruthy());
  });

  it('recommendation failure preserves the custom path', async () => {
    const user = userEvent.setup();
    decantingAPI.calculateDecantingPlan.mockImplementation(async (payload) => {
      if (payload.selectedSizes.join(',') === '10,5,2,1,0.5') throw new Error('boom');
      return plan({ bags: { '10kg': 1 } });
    });
    await openWorkPage(user);
    await enterWeights(user, { weighed: '10', required: '10' });

    expect(await screen.findByText("We couldn't create a recommended bag plan. You can still choose your own bag sizes.")).toBeInTheDocument();
    await chooseCustomPlan(user);
    await user.click(screen.getByRole('button', { name: '10kg' }));
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));
    expect(await screen.findByText('Custom plan')).toBeInTheDocument();
  });

  it('partial bag still displays separately', async () => {
    const user = userEvent.setup();
    decantingAPI.calculateDecantingPlan.mockResolvedValue(plan({
      bags: { '5kg': 1, '2kg': 1, '500g': 1 },
      partialBag: { nominalSizeKg: 0.5, actualWeightKg: 0.02, isPartial: true },
      surplusKg: 0,
      shortfallKg: 0,
    }));
    await openWorkPage(user);
    await enterWeights(user);
    await openBagPlanPanel(user);

    expect(screen.getByText('Partial 500g bag')).toBeInTheDocument();
    expect(screen.getByText('Actual contents: 20g')).toBeInTheDocument();
  });

  it('unresolved remainder of at least 500g displays a clear notice', async () => {
    const user = userEvent.setup();
    decantingAPI.calculateDecantingPlan.mockResolvedValue(plan({
      bags: { '5kg': 1, '2kg': 1 },
      surplusKg: 0.52,
      shortfallKg: 0,
    }));
    await openWorkPage(user);
    await enterWeights(user);
    await openBagPlanPanel(user);

    expect(screen.getByText(/520g cannot be packed using the selected bag sizes/)).toBeInTheDocument();
  });

  it('decimal and comma input are normalized before calculation', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user, { weighed: '7,52', required: '7.520' });

    await waitFor(() => expect(
      decantingAPI.calculateDecantingPlan.mock.calls.some(([payload]) => (
        payload.items[0].actualBulkKg === 7.52 && payload.items[0].requiredKg === 7.52
      ))
    ).toBe(true));
  });

  it('malformed numeric input is rejected on attempted action', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user, { weighed: '7..5', required: '7.52' });

    await user.click(screen.getByRole('button', { name: 'Save decanted amount' }));

    expect(screen.getByText('Enter a valid weight.')).toBeInTheDocument();
  });

  it('wastage greater than actual weight is rejected on save', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user);
    await openBagPlanPanel(user);
    await user.click(screen.getByRole('button', { name: 'Use recommended plan' }));
    await user.click(screen.getByRole('button', { name: 'I have filled them' }));
    await user.type(screen.getByLabelText('Spilled or spoiled, in kilograms'), '8');
    await user.click(screen.getByRole('button', { name: 'Save decanted amount' }));

    expect(screen.getByText('Wastage cannot be greater than the weighed amount.')).toBeInTheDocument();
    expect(decantingAPI.recordDecanting).not.toHaveBeenCalled();
  });

  it('stale custom requests cannot overwrite the latest custom selection', async () => {
    const user = userEvent.setup();
    decantingAPI.calculateDecantingPlan.mockImplementation((payload) => {
      const sizes = payload.selectedSizes.join(',');
      // A request for 10kg alone would never answer; none should be made.
      if (sizes === '10') return new Promise(() => {});
      if (sizes === '10,2') return Promise.resolve(plan({ bags: { '10kg': 1, '2kg': 1 } }));
      return Promise.resolve(plan());
    });
    await openWorkPage(user);
    await enterWeights(user, { weighed: '12', required: '12' });
    await waitForRecommendation();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));
    expect(findCallBySizes('10')).toBeFalsy();
    await user.click(screen.getByRole('button', { name: '2kg' }));
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));
    await waitFor(() => expect(findCallBySizes('10,2')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText(/^bags? of 2kg$/).length).toBeGreaterThan(0));
  });

  it('genuine selected-size request failure keeps selections and shows the safe error', async () => {
    const user = userEvent.setup();
    decantingAPI.calculateDecantingPlan.mockImplementation((payload) => {
      const sizes = payload.selectedSizes.join(',');
      if (sizes === '10,2') return Promise.reject(new Error('latest failure'));
      return Promise.resolve(plan({ surplusKg: 0, shortfallKg: 0 }));
    });
    await openWorkPage(user, '10');
    await enterWeights(user, { weighed: '12', required: '12' });
    await waitForRecommendation();
    await chooseCustomPlan(user);

    await user.click(screen.getByRole('button', { name: '10kg' }));
    await user.click(screen.getByRole('button', { name: '2kg' }));
    await user.click(screen.getByRole('button', { name: 'Use selected bag sizes' }));

    expect(await screen.findByText("We couldn't calculate that custom bag plan. Your recommended plan is still available.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'I have filled them' })).not.toBeInTheDocument();
  });

  it('duplicate recommendation requests for the same valid inputs are prevented', async () => {
    const user = userEvent.setup();
    await openWorkPage(user);
    await enterWeights(user, { weighed: '7.52', required: '7.52' });
    await waitForRecommendation();
    const recommendationCalls = decantingAPI.calculateDecantingPlan.mock.calls
      .filter(([payload]) => (
        payload.selectedSizes.join(',') === '10,5,2,1,0.5'
        && payload.items[0].actualBulkKg === 7.52
        && payload.items[0].requiredKg === 7.52
      ));

    expect(recommendationCalls.length).toBe(1);
  });
});




