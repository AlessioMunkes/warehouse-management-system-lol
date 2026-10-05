import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({ user: null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

import PageNotFound from '../pages/PageNotFound';

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const renderAt = (entries, initialIndex) => render(
  <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
    <Routes>
      <Route path="/" element={<Where />} />
      <Route path="/manager" element={<Where />} />
      <Route path="/earlier" element={<Where />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  </MemoryRouter>,
);

describe('PageNotFound', () => {
  it('Go back returns to the previous page when there is one', async () => {
    auth.user = { role: 'manager' };
    renderAt(['/earlier', '/nope'], 1);
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByTestId('where').textContent).toBe('/earlier');
  });

  it('Go back goes to the role home when this is the first page in the tab', async () => {
    auth.user = { role: 'manager' };
    renderAt(['/nope'], 0);
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByTestId('where').textContent).toBe('/manager');
  });

  it('Go back goes to the landing page when signed out and first in the tab', async () => {
    auth.user = null;
    renderAt(['/nope'], 0);
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('Go to home still goes to /', async () => {
    auth.user = { role: 'manager' };
    renderAt(['/earlier', '/nope'], 1);
    await userEvent.click(screen.getByRole('button', { name: 'Go to home' }));
    expect(screen.getByTestId('where').textContent).toBe('/');
  });
});
