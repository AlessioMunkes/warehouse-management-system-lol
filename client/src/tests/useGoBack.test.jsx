import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({ user: { role: 'manager' } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

import useGoBack from '../components/layout/useGoBack';
import { TopNavbar } from '../components/layout/TopNavBar';

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const BackButton = () => {
  const goBack = useGoBack();
  return <button type="button" onClick={goBack}>back</button>;
};

const renderAt = (entries, initialIndex, element = <BackButton />) => render(
  <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
    <Routes>
      <Route path="*" element={<>{element}<Where /></>} />
    </Routes>
  </MemoryRouter>,
);

describe('useGoBack', () => {
  it('goes back when the tab has an earlier page', async () => {
    auth.user = { role: 'manager' };
    renderAt(['/noc/inventory', '/noc/purchase-orders'], 1);
    await userEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByTestId('where').textContent).toBe('/noc/inventory');
  });

  it.each([
    ['manager', '/manager'],
    ['admin', '/admin'],
    ['warehouse_worker', '/noc'],
  ])('goes to the %s home when this is the first page in the tab', async (role, home) => {
    auth.user = { role };
    renderAt(['/noc/purchase-orders'], 0);
    await userEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByTestId('where').textContent).toBe(home);
  });

  it('goes to the landing page when nobody is signed in', async () => {
    auth.user = null;
    renderAt(['/somewhere'], 0);
    await userEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByTestId('where').textContent).toBe('/');
  });
});

describe('top bar back button', () => {
  it('keeps its label and goes home on the first page in the tab', async () => {
    auth.user = { role: 'admin', firstName: 'A', lastName: 'B' };
    renderAt(['/admin/users'], 0, <TopNavbar />);
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByTestId('where').textContent).toBe('/admin');
  });

  it('goes back when there is an earlier page', async () => {
    auth.user = { role: 'admin', firstName: 'A', lastName: 'B' };
    renderAt(['/admin', '/admin/users'], 1, <TopNavbar />);
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByTestId('where').textContent).toBe('/admin');
  });
});
