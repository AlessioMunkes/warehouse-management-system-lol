// ─────────────────────────────────────────────────────────────
// src/tests/FeedTheSoilIdleKits.test.jsx
//
// The dashboard's idle-kits line opens Feed the Soil with
// ?status=idle. That tab holds exactly the kits the server flags as
// idle (is_idle, the same rule the count uses), and is hidden when
// there are none.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const router = { params: new URLSearchParams() };
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useSearchParams: () => [router.params, vi.fn()],
}));
vi.mock('../services/collectionKitAPI', () => ({
  default: { listKits: vi.fn(), listRecords: vi.fn(async () => []) },
}));

const { default: api } = await import('../services/collectionKitAPI');
const { default: FeedTheSoilManagerView } = await import('../features/feedTheSoil/FeedTheSoilManagerView');

const kit = (id, owner, isIdle) => ({
  id, owner_name: owner, suburb: 'Langa', status: 'assigned', assigned_at: '2026-05-01', is_idle: isIdle,
});

beforeEach(() => {
  router.params = new URLSearchParams();
});

describe('Feed the Soil: idle kits', () => {
  it('opens on the Idle kits tab from the dashboard link, showing only idle kits', async () => {
    api.listKits.mockResolvedValue([kit(1, 'Thandi', true), kit(2, 'Pieter', false)]);
    router.params = new URLSearchParams('status=idle');
    render(<FeedTheSoilManagerView />);

    expect(await screen.findByText('Thandi')).toBeInTheDocument();
    expect(screen.queryByText('Pieter')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Idle kits 1/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('has no Idle kits tab when no kit is idle', async () => {
    api.listKits.mockResolvedValue([kit(2, 'Pieter', false)]);
    render(<FeedTheSoilManagerView />);
    expect(await screen.findByText('Pieter')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Idle kits/ })).toBeNull();
  });
});
