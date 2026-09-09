import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CategoryRoutingRulesPage from '../pages/CategoryRoutingRulesPage';

const { mockGetCategoryRules, mockUpdateCategoryRule } = vi.hoisted(() => ({
  mockGetCategoryRules: vi.fn(),
  mockUpdateCategoryRule: vi.fn(),
}));

vi.mock('../features/taskdashboard/components/TopNavBar', () => ({
}));

vi.mock('../services/categoryRoutingAPI', () => ({
  default: {
    getCategoryRules: mockGetCategoryRules,
    updateCategoryRule: mockUpdateCategoryRule,
  },
}));

describe('CategoryRoutingRulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCategoryRules.mockResolvedValue([
      {
        category: 'recipe_food',
        routing_outcome: 'Donate to the soup kitchen',
        storage_area: 'Soup Kitchen Prep',
        description: 'Standard recipe food routing',
      },
      {
        category: 'add_on_food',
        routing_outcome: 'Dry storage review',
        storage_area: 'dry_store',
        description: 'Additional food items',
      },
    ]);

    mockUpdateCategoryRule.mockImplementation(async (category, payload) => ({
      category,
      routing_outcome: payload.routingOutcome,
      storage_area: payload.storageArea,
      description: payload.description,
    }));
  });

  it('loads the routing rules and renders the table', async () => {
    render(<CategoryRoutingRulesPage />);

    await waitFor(() => {
      expect(screen.getByText('Category Routing Rules')).toBeInTheDocument();
    });

    expect(screen.getByText('Recipe Food')).toBeInTheDocument();
    expect(screen.getByText('Donate to the soup kitchen')).toBeInTheDocument();
  });

  it('opens the inline editor and saves updates for a selected rule', async () => {
    render(<CategoryRoutingRulesPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Edit Recipe Food')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Edit Recipe Food'));

    const input = screen.getByDisplayValue('Donate to the soup kitchen');
    fireEvent.change(input, { target: { value: 'Send to dry store first' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockUpdateCategoryRule).toHaveBeenCalledWith('recipe_food', {
        routingOutcome: 'Send to dry store first',
        storageArea: 'Soup Kitchen Prep',
        description: 'Standard recipe food routing',
      });
    });
  });

  it('shows the API error inline when a save fails', async () => {
    mockUpdateCategoryRule.mockRejectedValueOnce(new Error('Invalid storage area selected.'));

    render(<CategoryRoutingRulesPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Edit Recipe Food')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Edit Recipe Food'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid storage area selected.')).toBeInTheDocument();
    });
  });
});
