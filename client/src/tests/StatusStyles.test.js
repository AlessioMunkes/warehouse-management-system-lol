// ─────────────────────────────────────────────────────────────
// client/src/tests/StatusStyles.test.js
//
// Two statuses in one list must never look the same. They may share a
// colour — the colour is the meaning — but then the fill (solid or
// soft) or the icon has to differ. And every status the app can show
// has to have a style, or it falls back to plain grey unnoticed.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { STATUS_STYLES } from '../lib/statusStyles';
import { PO_STATUS_LABELS } from '../services/purchaseOrderAPI';
import { OUTCOMES } from '../services/communityRequestAPI';
import { EVENT_STATUS_LABELS } from '../services/volunteerManagementAPI';
import { DELIVERY_STATUS_LABEL, DISPATCH_STATUS_LABEL } from '../features/receipts/components/noteFormat';

const LEDGER_TYPES = ['adjustment', 'decanted', 'dispatched', 'donated', 'picked', 'received', 'wastage'];

describe('status styles', () => {
  it.each(Object.entries(STATUS_STYLES))('no two %s statuses look alike', (_kind, styles) => {
    const looks = Object.entries(styles).map(([status, st]) => [
      status, `${st.tone}|${st.strong ? 'solid' : 'soft'}|${st.icon?.displayName ?? st.icon?.name ?? String(st.icon)}`,
    ]);
    const seen = new Map();
    for (const [status, look] of looks) {
      expect(seen.get(look), `${status} looks the same as ${seen.get(look)}`).toBeUndefined();
      seen.set(look, status);
    }
  });

  it('gives each status in a list its own icon', () => {
    for (const [kind, styles] of Object.entries(STATUS_STYLES)) {
      const icons = Object.values(styles).map((st) => st.icon);
      expect(new Set(icons).size, kind).toBe(icons.length);
    }
  });

  it.each([
    ['purchaseOrder', Object.keys(PO_STATUS_LABELS)],
    ['communityRequest', OUTCOMES],
    ['volunteerEvent', Object.keys(EVENT_STATUS_LABELS)],
    ['delivery', Object.keys(DELIVERY_STATUS_LABEL)],
    ['dispatch', Object.keys(DISPATCH_STATUS_LABEL)],
    ['ledger', LEDGER_TYPES],
    ['inventory', ['in_stock', 'low_stock', 'shortfall']],
    ['message', ['sent', 'stubbed', 'failed']],
    ['pickingSlip', ['pending', 'in_progress', 'complete', 'dispatched', 'collected', 'not_collected', 'cancelled']],
    ['expiry', ['ok', 'soon', 'expired']],
  ])('styles every %s status the app can show', (kind, statuses) => {
    for (const status of statuses) expect(STATUS_STYLES[kind][status], `${kind}.${status}`).toBeTruthy();
  });
});
