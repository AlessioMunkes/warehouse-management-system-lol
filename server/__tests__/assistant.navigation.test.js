// ─────────────────────────────────────────────────────────────
// server/__tests__/assistant.navigation.test.js
//
// The assistant can move people. This is the file that says it
// cannot move them somewhere they are not allowed.
//
// The claim being tested is narrow and worth stating precisely:
// helpCatalog's SCREENS.roles is the FIRST of three gates, and it
// can only ever decline. ProtectedRoute and the server's
// requireRole are the real controls and are untouched by any of
// this. What could still go wrong is the assistant OFFERING a
// screen the app will then refuse — a link to a locked door, which
// reads as a broken system rather than a permission.
//
// So: every screen, every role, from both directions.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SCREENS, SCREEN_IDS, screensForRole, screenForRole,
} from '../src/features/assistant/helpCatalog.js';
import { buildTools, buildSystemPrompt } from '../src/features/assistant/ai/toolSchema.js';

const ROLES = ['warehouse_worker', 'manager', 'admin'];

const providerMock = {
  isEnabled:     vi.fn(() => true),
  providerName:  vi.fn(() => 'google:test'),
  callWithTools: vi.fn(),
};
vi.mock('../src/features/reporting/ai/provider.js', () => ({ default: providerMock }));
vi.mock('../src/repositories/assistantLog.repository.js', () => ({
  default: { record: vi.fn() },
}));

const { default: service } = await import('../src/services/assistant.service.js');

const call = (name, args) => providerMock.callWithTools.mockResolvedValueOnce({ name, args });

beforeEach(() => {
  vi.clearAllMocks();
  providerMock.isEnabled.mockReturnValue(true);
  providerMock.providerName.mockReturnValue('google:test');
});

describe('which screens each role may be sent to', () => {
  it('gives a warehouse worker the floor screens and nothing managerial', () => {
    const ids = screensForRole('warehouse_worker').map((s) => s.id);
    expect(ids).toContain('receiving');
    expect(ids).toContain('dispatch');
    expect(ids).toContain('packing');
    expect(ids).toContain('donation');
    // Manager-and-up in App.jsx. A worker sent here lands on a bounce.
    expect(ids).not.toContain('inventory');
    expect(ids).not.toContain('purchaseOrders');
    expect(ids).not.toContain('reporting');
    expect(ids).not.toContain('beneficiaries');
    // Admin-only.
    expect(ids).not.toContain('products');
    expect(ids).not.toContain('users');
  });

  it('gives a manager the operational screens but not master data', () => {
    const ids = screensForRole('manager').map((s) => s.id);
    expect(ids).toContain('inventory');
    expect(ids).toContain('purchaseOrders');
    expect(ids).toContain('reporting');
    expect(ids).not.toContain('products');
    expect(ids).not.toContain('users');
    expect(ids).not.toContain('section18a');
  });

  it('gives an admin every screen', () => {
    expect(screensForRole('admin')).toHaveLength(SCREENS.length);
  });

  it('never returns a screen the role is not on', () => {
    for (const role of ROLES) {
      for (const s of screensForRole(role)) {
        expect(s.roles, `${role} / ${s.id}`).toContain(role);
      }
    }
  });

  it('gives every screen at least one role, so none is unreachable', () => {
    for (const s of SCREENS) {
      expect(s.roles?.length, s.id).toBeGreaterThan(0);
    }
  });
});

describe('the enum handed to the model', () => {
  // The primary gate. The model cannot ask for a screen that was
  // never in its vocabulary.
  it('lists only the screens this role may open', () => {
    for (const role of ROLES) {
      const allowed = screensForRole(role).map((s) => s.id);
      const open = buildTools(role).find((t) => t.name === 'open_screen');
      expect(open.parameters.properties.screen_id.enum, role).toEqual(allowed);
    }
  });

  it('keeps a forbidden screen out of the prompt entirely', () => {
    const prompt = buildSystemPrompt('warehouse_worker');
    // Not merely unlisted — absent, so the model has no name for it.
    expect(prompt).not.toContain('purchaseOrders');
    expect(prompt).not.toContain('emailIntegration');
  });

  it('tells the model not to substitute a screen it was not given', () => {
    const prompt = buildSystemPrompt('warehouse_worker').replace(/\s+/g, ' ');
    expect(prompt).toMatch(/do NOT pick the nearest one/i);
  });
});

describe('the second gate, in the service', () => {
  it('opens a screen the role is allowed', async () => {
    call('open_screen', { screen_id: 'inventory' });
    const res = await service.ask({
      question: 'take me to inventory', userId: 1, role: 'manager',
    });
    expect(res).toEqual({ type: 'navigate', screen: { id: 'inventory', label: 'Inventory' } });
  });

  // The one that matters. Even if the enum were wrong, or the model
  // returned something it was never offered, this refuses.
  it('refuses a screen the role is not allowed, however it got there', async () => {
    call('open_screen', { screen_id: 'products' });   // admin-only
    call('open_screen', { screen_id: 'products' });   // and again on retry

    await expect(
      service.ask({ question: 'take me to product management', userId: 1, role: 'manager' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it.each([
    ['warehouse_worker', 'inventory'],
    ['warehouse_worker', 'users'],
    ['warehouse_worker', 'reporting'],
    ['manager', 'products'],
    ['manager', 'section18a'],
  ])('refuses to send a %s to %s', async (role, screenId) => {
    call('open_screen', { screen_id: screenId });
    call('open_screen', { screen_id: screenId });
    await expect(
      service.ask({ question: `take me to ${screenId}`, userId: 1, role })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('refuses a screen that does not exist at all', async () => {
    call('open_screen', { screen_id: 'payroll' });
    call('open_screen', { screen_id: 'payroll' });
    await expect(
      service.ask({ question: 'take me to payroll', userId: 1, role: 'admin' })
    ).rejects.toMatchObject({ status: 422 });
  });

  // A forbidden screen and a made-up one must be indistinguishable,
  // or the refusal itself tells you what exists.
  it('answers a forbidden screen exactly as it answers a fictional one', () => {
    expect(screenForRole('products', 'warehouse_worker')).toBeNull();
    expect(screenForRole('payroll',  'warehouse_worker')).toBeNull();
  });

  it('recovers when the retry names a screen the role can open', async () => {
    call('open_screen', { screen_id: 'users' });      // refused
    call('open_screen', { screen_id: 'receipts' });   // allowed
    const res = await service.ask({
      question: 'take me somewhere', userId: 1, role: 'manager',
    });
    expect(res.screen.id).toBe('receipts');
  });
});

describe('the catalogue the client is given', () => {
  it('lists only the screens the role may be sent to', () => {
    for (const role of ROLES) {
      const allowed = new Set(screensForRole(role).map((s) => s.id));
      for (const s of service.getCatalog(role).screens) {
        expect(allowed, `${role}: ${s.id}`).toContain(s.id);
      }
    }
  });

  it('does not tell a worker that Product Management exists', () => {
    const ids = service.getCatalog('warehouse_worker').screens.map((s) => s.id);
    expect(ids).not.toContain('products');
    expect(ids).not.toContain('users');
  });
});

describe('the provider speaks in codes so the help panel can use its own words', () => {
  const providerFail = (status, message, code) => {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    providerMock.callWithTools.mockRejectedValue(err);
  };

  // The bug this pins: the reporting provider's messages end "use the
  // report builder below", and the help panel has no report builder.
  // It was reaching users.
  it.each([
    ['rate_limit',    429],
    ['busy',          503],
    ['timeout',       504],
    ['unreachable',   502],
    ['model_missing', 502],
    ['error',         502],
  ])('rewrites a %s failure without mentioning the report builder', async (code, status) => {
    providerFail(status, 'Something. Use the report builder below.', code);

    await expect(
      service.ask({ question: 'how do I receive', userId: 1, role: 'warehouse_worker' })
    ).rejects.toMatchObject({
      status,
      message: expect.not.stringContaining('report builder'),
    });
  });

  it('keeps the status, so the client still knows whether waiting helps', async () => {
    providerFail(503, 'busy. Use the report builder below.', 'busy');
    await expect(
      service.ask({ question: 'how do I receive', userId: 1, role: 'manager' })
    ).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/clears in a minute/i) });
  });

  // An untagged error from anywhere else must pass through rather
  // than be swallowed by a lookup miss.
  it('passes an untagged failure through unchanged', async () => {
    const err = new Error('something else entirely');
    err.status = 500;
    providerMock.callWithTools.mockRejectedValue(err);
    await expect(
      service.ask({ question: 'how do I receive', userId: 1, role: 'manager' })
    ).rejects.toMatchObject({ message: 'something else entirely' });
  });
});

describe('every screen id is spelled the same everywhere', () => {
  it('has no duplicates', () => {
    expect(new Set(SCREEN_IDS).size).toBe(SCREEN_IDS.length);
  });
});
