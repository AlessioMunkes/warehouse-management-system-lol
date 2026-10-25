// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.staff.test.js
//
// "By staff member": the breakdown and filter on the reports where a
// person is recorded, the Staff activity report, and the rule that a
// person's name never reaches the AI model.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { METRICS, DIMENSIONS, FILTERS, STAFF_AREAS } from '../src/features/reporting/reportCatalog.js';
import { DRILL_FILTERS, planDrill } from '../src/features/reporting/drillDown.js';
import { aliasPeople } from '../src/features/reporting/narrative.js';
import { staffName, staffFilter } from '../src/repositories/reportingStaff.sql.js';

const BY_STAFF = [
  'goods_received', 'receiving_discrepancy_rate', 'picking_flag_rate', 'picking_turnaround',
  'dispatch_volume', 'decanting_wastage', 'decanting_margin_rate', 'donation_value',
  'stock_movement_volume', 'adjustment_reasons', 'staff_activity',
];

describe('the staff breakdown', () => {
  it('is offered, with its filter, on every report that records a person', () => {
    expect(DIMENSIONS.staff.label).toBe('Staff member');
    expect(FILTERS.staff_id.values).toBeNull();
    for (const id of BY_STAFF) {
      expect(METRICS[id].dimensions, id).toContain('staff');
      expect(METRICS[id].filters, id).toContain('staff_id');
    }
  });

  it('is never offered on donor, impact or volunteer reports', () => {
    for (const id of ['section18a_pipeline', 'children_reached', 'meals_enabled', 'volunteer_hours', 'community_request_outcomes']) {
      expect(METRICS[id].dimensions, id).not.toContain('staff');
    }
  });

  it('drills from a person to their work, by the full name the bar shows', () => {
    expect(DRILL_FILTERS.staff).toEqual({ filter: 'staff_id', lookupTable: 'users' });
    const plan = planDrill(METRICS.goods_received, {
      metric: 'goods_received', dimension: 'staff', filters: {}, dateRange: { from: '2026-07-01', to: '2026-09-30' },
    }, 'Nomsa Dlamini');
    expect(plan.lookup).toEqual({ table: 'users', name: 'Nomsa Dlamini' });
    expect(plan.filter).toBe('staff_id');
    expect(plan.spec.dimension).toBe('month');
  });

  it('binds the person as a parameter, never in the SQL text', () => {
    const params = ['2026-07-01', '2026-09-30'];
    expect(staffFilter('dn.received_by', { staff_id: 7 }, params)).toEqual(['dn.received_by = $3']);
    expect(params).toEqual(['2026-07-01', '2026-09-30', 7]);
    expect(staffFilter('dn.received_by', {}, params)).toEqual([]);
    expect(staffName('dn.received_by')).toMatch(/FROM users su WHERE su\.id = dn\.received_by/);
  });

  it('splits Staff activity by the areas of the floor', () => {
    expect(STAFF_AREAS.map((a) => a.id)).toEqual(['receiving', 'packing', 'gate', 'decanting', 'donations', 'adjustments']);
    expect(FILTERS.staff_area.values).toEqual(STAFF_AREAS.map((a) => a.id));
  });
});

describe('names and the AI model', () => {
  it('sends people as aliases and puts the names back in what comes back', () => {
    const payload = JSON.stringify({ rows: [{ label: 'Nomsa Dlamini', value: 40 }, { label: 'Bheki Mthembu', value: 12 }], question: 'Goods received by Nomsa Dlamini' });
    const { text, back } = aliasPeople(payload, ['Bheki Mthembu', 'Nomsa Dlamini', 'Someone Absent']);
    expect(text).not.toMatch(/Nomsa|Bheki|Dlamini|Mthembu/);
    expect(text).toMatch(/Person A/);
    const names = [...text.matchAll(/Person [A-Z]/g)].map((m) => m[0]);
    expect(new Set(names).size).toBe(2);
    expect(back('Person A received most; Person B less.')).toMatch(/(Nomsa Dlamini|Bheki Mthembu) received most; (Nomsa Dlamini|Bheki Mthembu) less\./);
  });

  it('leaves a payload with no people in it alone', () => {
    const payload = JSON.stringify({ rows: [{ label: 'Rice', value: 4 }] });
    const { text, back } = aliasPeople(payload, ['Nomsa Dlamini']);
    expect(text).toBe(payload);
    expect(back('Rice went up.')).toBe('Rice went up.');
  });
});
