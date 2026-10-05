// Phone alerts for the floor: the worker is told plainly when their
// phone can't get them, is asked only from a tap, and a tapped alert
// opens the Packing tab in the app that's already open.
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => navigate,
}));
vi.mock('../services/pushAPI', () => ({
  getPushPublicKey: vi.fn().mockResolvedValue('BAAA'),
  savePushSubscription: vi.fn().mockResolvedValue(),
  removePushSubscription: vi.fn().mockResolvedValue(),
}));

import PhoneAlerts from '../features/notifications/components/PhoneAlerts';
import usePushMessages from '../features/notifications/usePushMessages';
import { phoneAlertSupport } from '../features/notifications/phoneAlerts';
import { NOTIFICATIONS_CHANGED } from '../features/notifications/notificationMatrix';

const realUA = navigator.userAgent;
const setUA = (ua) => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });

beforeEach(() => {
  vi.clearAllMocks();
  try { window.localStorage.clear(); } catch { /* none */ }
});
afterEach(() => {
  setUA(realUA);
  delete window.Notification;
  delete window.PushManager;
});

describe('whether this phone can get alerts', () => {
  it('tells an iPhone user to install the app first', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(phoneAlertSupport()).toBe('install-first');
  });

  it('says so when the browser has no push at all', () => {
    expect(phoneAlertSupport()).toBe('unsupported');
  });

  it('knows when alerts were blocked, and when they can be asked for', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: vi.fn().mockResolvedValue(null), addEventListener() {}, removeEventListener() {} }, configurable: true });
    window.PushManager = function PushManager() {};
    window.Notification = { permission: 'denied' };
    expect(phoneAlertSupport()).toBe('blocked');
    window.Notification = { permission: 'default' };
    expect(phoneAlertSupport()).toBe('ask');
  });
});

describe('the card in the bell', () => {
  it('explains what to do on an iPhone instead of offering a dead button', async () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    render(<PhoneAlerts />);
    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /turn on/i })).not.toBeInTheDocument();
  });

  it('only asks for permission when the worker taps Turn on', async () => {
    window.PushManager = function PushManager() {};
    const requestPermission = vi.fn().mockResolvedValue('default');
    window.Notification = { permission: 'default', requestPermission };
    render(<PhoneAlerts />);
    expect(requestPermission).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe('a tapped alert', () => {
  function Listener() { usePushMessages(); return null; }

  it('opens where it points, and refreshes the bell and Packing dot', () => {
    const listeners = {};
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: (type, fn) => { listeners[type] = fn; },
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
    const changed = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED, changed);
    render(<MemoryRouter><Listener /></MemoryRouter>);

    act(() => listeners.message({ data: { type: 'push-received' } }));
    expect(changed).toHaveBeenCalledTimes(1);

    act(() => listeners.message({ data: { type: 'push-open', url: '/noc/packing' } }));
    expect(navigate).toHaveBeenCalledWith('/noc/packing');

    // Only paths inside the app.
    act(() => listeners.message({ data: { type: 'push-open', url: 'https://evil.example' } }));
    expect(navigate).toHaveBeenCalledTimes(1);
    window.removeEventListener(NOTIFICATIONS_CHANGED, changed);
  });
});
