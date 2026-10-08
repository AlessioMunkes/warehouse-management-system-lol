// ─────────────────────────────────────────────────────────────
// client/src/tests/RecipesSection.test.jsx
//
// Settings → Recipes: what the admin sees, and what is sent when they
// save a recipe or a list of centres.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/recipeAPI', () => ({
  getRecipes: vi.fn(),
  createOverrideRecipe: vi.fn(),
  saveRecipe: vi.fn(),
  deleteOverrideRecipe: vi.fn(),
  saveSeasonStarts: vi.fn(),
  saveOwnOrderCentres: vi.fn(),
}));
vi.mock('../services/productAPI', () => ({
  default: { getProducts: vi.fn(async () => [
    { id: 7, name: 'Samp', defaultUnit: 'kg' },
    { id: 8, name: 'Butternut', defaultUnit: 'crate' },
  ]) },
}));
vi.mock('../services/beneficiaryAPI', () => ({
  default: { getBeneficiaries: vi.fn(async () => [{ id: 4, name: 'Green Pastures', childCount: 25 }]) },
}));
vi.mock('@/components/ui/toastContext', () => ({ useToast: () => vi.fn() }));

const api = await import('../services/recipeAPI');
const { default: RecipesSection } = await import('../features/settings/components/RecipesSection');
const { exampleQuantity, exampleCentre, bandedChildCount } = await import('../features/settings/recipeMath');

const OVERVIEW = {
  today: '2026-10-07',
  currentRecipeId: 1,
  recipes: [
    { id: 1, name: 'Summer', kind: 'summer', seasonStart: { month: 9, day: 1 }, startsOn: null, endsOn: null,
      lines: [{ productId: 7, productName: 'Samp', quantityPerChild: 0.3, unit: 'kg' }] },
    { id: 2, name: 'Winter', kind: 'winter', seasonStart: { month: 5, day: 1 }, startsOn: null, endsOn: null, lines: [] },
    { id: 3, name: 'December holiday', kind: 'override', seasonStart: null, startsOn: '2026-12-15', endsOn: '2026-12-31', lines: [] },
  ],
  ownOrderCentres: [{ id: 4, name: 'Green Pastures', childCount: 25 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getRecipes.mockResolvedValue(OVERVIEW);
  api.saveRecipe.mockResolvedValue(OVERVIEW);
  api.saveOwnOrderCentres.mockResolvedValue({ ...OVERVIEW, ownOrderCentres: [] });
});

describe('recipe sums', () => {
  it('rounds a child count up to its band', () => {
    expect(bandedChildCount(23, 5)).toBe(25);
    expect(bandedChildCount(25, 5)).toBe(25);
    expect(bandedChildCount(26, 5)).toBe(30);
    expect(bandedChildCount(23, 1)).toBe(23);
    expect(bandedChildCount(0, 5)).toBe(0);
  });

  it('multiplies the amount per child by the banded count', () => {
    expect(exampleQuantity('0.3')).toBe(7.5);                                  // 23 children, counted as 25
    expect(exampleQuantity(0.58, { children: 25, band: 5 })).toBe(14.5);
    expect(exampleQuantity(0.3, { children: 23, band: 1 })).toBe(6.9);
    expect(exampleQuantity(0.3, { children: 23, band: 10 })).toBe(9);
    // Cans are counted, so they round up to a whole one; kilograms do not.
    expect(exampleQuantity(0.12, { children: 28, band: 5, unit: 'each' })).toBe(4);   // 3.6
    expect(exampleQuantity(0.12, { children: 75, band: 5, unit: 'each' })).toBe(9);   // exactly 9, not 10
    expect(exampleQuantity(0.12, { children: 28, band: 5, unit: 'kg' })).toBe(3.6);
    expect(exampleQuantity('')).toBeNull();
    expect(exampleQuantity('-1')).toBeNull();
  });

  it('says how the example centre is counted', () => {
    expect(exampleCentre({ band: 5 })).toBe('for 23 children (counted as 25)');
    expect(exampleCentre({ band: 1 })).toBe('for 23 children');
  });
});

describe('RecipesSection', () => {
  it('opens on the recipe in use, and lists summer, winter and the overrides', async () => {
    render(<RecipesSection />);

    expect(await screen.findByRole('tab', { name: /Summer · in use/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Winter' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'December holiday' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'New override' })).toBeInTheDocument();
    expect(screen.getByText('Slips dated today use the Summer recipe.')).toBeInTheDocument();
  });

  it('shows what a line comes to for a centre, rounded up to its band', async () => {
    render(<RecipesSection />);
    expect(await screen.findByText('7.5 kg for 23 children (counted as 25)')).toBeInTheDocument();
  });

  it('uses the band from settings, and lets the admin change it', async () => {
    const band = { key: 'recipes.childBand', section: 'recipes', label: 'Children per band', help: 'Round up.', default: 5, min: 1, max: 50, unit: 'children', value: 10 };
    render(<RecipesSection settings={[band]} onSettingsSaved={vi.fn()} />);

    expect(await screen.findByText('9 kg for 23 children (counted as 30)')).toBeInTheDocument();
    expect(screen.getByLabelText('Children per band')).toHaveValue(10);
    expect(screen.getByText(/rounded up to the next 10/)).toBeInTheDocument();
  });

  it('saves a changed amount per child with the recipe’s lines', async () => {
    const user = userEvent.setup();
    render(<RecipesSection />);

    const amount = await screen.findByLabelText('Amount per child for line 1');
    await user.clear(amount);
    await user.type(amount, '0.5');
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    await waitFor(() => expect(api.saveRecipe).toHaveBeenCalledTimes(1));
    expect(api.saveRecipe).toHaveBeenCalledWith(1, { lines: [{ productId: 7, quantityPerChild: '0.5', unit: 'kg' }] });
  });

  it('says an empty recipe hands slips back to standing orders', async () => {
    const user = userEvent.setup();
    render(<RecipesSection />);

    await user.click(await screen.findByRole('tab', { name: 'Winter' }));
    expect(screen.getByText(/slips for these dates use each centre’s standing order/)).toBeInTheDocument();
  });

  it('asks for a name and dates on an override, and not on a season', async () => {
    const user = userEvent.setup();
    render(<RecipesSection />);

    await screen.findByRole('tab', { name: /Summer/ });
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'December holiday' }));
    expect(screen.getByLabelText('Name')).toHaveValue('December holiday');
    expect(screen.getByLabelText('From')).toHaveValue('2026-12-15');
    expect(screen.getByLabelText('To')).toHaveValue('2026-12-31');
    expect(screen.getByRole('button', { name: /Delete recipe/ })).toBeInTheDocument();
  });

  it('shows the server’s reason when a save is refused', async () => {
    const user = userEvent.setup();
    api.saveRecipe.mockRejectedValue(new Error('Line 1: enter an amount per child greater than 0.'));
    render(<RecipesSection />);

    const amount = await screen.findByLabelText('Amount per child for line 1');
    await user.clear(amount);
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Line 1: enter an amount per child greater than 0.');
  });

  it('removes a centre from the own-order list', async () => {
    const user = userEvent.setup();
    render(<RecipesSection />);

    await screen.findByText('Green Pastures');
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(api.saveOwnOrderCentres).toHaveBeenCalledWith([]));
    expect(await screen.findByText(/Every centre with a child count uses the recipes/)).toBeInTheDocument();
  });
});
