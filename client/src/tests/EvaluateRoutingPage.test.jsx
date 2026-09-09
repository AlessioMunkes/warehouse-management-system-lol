import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import EvaluateRoutingPage from '../pages/EvaluateRoutingPage';
import * as routingEvaluationAPI from '../services/routingEvaluationAPI';

vi.mock('../services/routingEvaluationAPI', () => ({
  ROUTING_CATEGORIES: ['recipe_food', 'add_on_food', 'non_recipe_food', 'non_food'],
  evaluateRouting: vi.fn(),
}));

describe('EvaluateRoutingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <AuthProvider>
          <EvaluateRoutingPage />
        </AuthProvider>
      </MemoryRouter>
    );

  it('evaluates routing and shows the decision trail for a product default', async () => {
    routingEvaluationAPI.evaluateRouting.mockResolvedValue({
      source: 'product_default',
      category: 'recipe_food',
      routing_outcome: 'donate_to_food_bank',
      storage_area: 'cold_room',
    });

    renderPage();

    fireEvent.change(screen.getByLabelText('Product ID'), { target: { value: '104' } });
    fireEvent.click(screen.getByRole('button', { name: /evaluate/i }));

    await waitFor(() => {
      expect(routingEvaluationAPI.evaluateRouting).toHaveBeenCalledWith({
        productId: 104,
        category: undefined,
      });
    });

    expect(await screen.findByText(/Result: routed via PRODUCT DEFAULT/i)).toBeInTheDocument();
    expect(screen.getByText(/Checked product #104 for a preset default/i)).toBeInTheDocument();
  });

  it('shows inline validation for invalid product IDs', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Product ID'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /evaluate/i }));

    expect(screen.getByText(/Product ID must be a valid positive integer/i)).toBeInTheDocument();
  });
});
