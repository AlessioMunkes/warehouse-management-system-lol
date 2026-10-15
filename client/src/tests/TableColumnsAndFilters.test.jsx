// ─────────────────────────────────────────────────────────────
// src/tests/TableColumnsAndFilters.test.jsx
//
// Every manager table can hide every column except the one that
// identifies a row, and offers "+ Filter" by the fields worth narrowing
// by (useListFilters).
// ─────────────────────────────────────────────────────────────
/* global process */
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import useListFilters from '../features/masterdata/useListFilters';

const ROWS = [
  { id: 1, supplier: 'Alliance Foods', unit: 'kg' },
  { id: 2, supplier: 'Masons', unit: 'kg' },
  { id: 3, supplier: 'Alliance Foods', unit: 'kg' },
];
const DEFS = [
  { key: 'supplier', label: 'Supplier', valueOf: (r) => r.supplier },
  { key: 'unit', label: 'Unit', valueOf: (r) => r.unit },
];

describe('useListFilters', () => {
  it('offers each value found in the rows, under its field, and not a field with one value', () => {
    const { result } = renderHook(() => useListFilters(DEFS, ROWS));
    expect(result.current.filters.map((f) => [f.group, f.label])).toEqual([
      ['Supplier', 'Alliance Foods'],
      ['Supplier', 'Masons'],
    ]);
  });

  it('narrows to the chosen value, labels its chip with the field, and clears', () => {
    const { result } = renderHook(() => useListFilters(DEFS, ROWS));
    act(() => result.current.filters.find((f) => f.label === 'Masons').onToggle());
    expect(result.current.apply(ROWS).map((r) => r.id)).toEqual([2]);
    expect(result.current.filters.find((f) => f.active).chipLabel).toBe('Supplier: Masons');
    act(() => result.current.clear());
    expect(result.current.apply(ROWS)).toHaveLength(3);
    expect(result.current.active).toBe(false);
  });
});

// Each table's column list: exactly one named column is alwaysOn (the
// identifying one). Unnamed always-on columns are a row's buttons.
const TABLES = {
  'features/activityLog/StaffActivityView.jsx': 1,
  'features/activityLog/VolunteerLogView.jsx': 1,
  'features/beneficiaries/beneficiaryColumns.jsx': 1,
  'features/feedTheSoil/FeedTheSoilManagerView.jsx': 2,
  'features/inventory/ledgerColumns.js': 1,
  'features/inventory/ReconciliationPanel.jsx': 1,
  'features/inventory/StockManifestTable.jsx': 1,
  'features/pickingSlips/SlipList.jsx': 1,
  'features/purchaseOrders/poColumns.jsx': 1,
  'features/reporting/ReorderPlanner.jsx': 1,
  'features/volunteerManagement/BookingTable.jsx': 1,
  'pages/AdminArchivePage.jsx': 1,
  'pages/CommunityRequestsPage.jsx': 1,
  'pages/EcdCollectionRemindersPage.jsx': 1,
  'pages/MessageHistoryPage.jsx': 1,
  'pages/OperatingCalendarPage.jsx': 1,
  'pages/ProductManagementPage.jsx': 1,
  'pages/Section18AManagementPage.jsx': 2,
  'pages/SupplierDirectoryPage.jsx': 1,
  'pages/UserDirectoryPage.jsx': 1,
  'pages/VolunteerEventsPage.jsx': 1,
};

describe('table columns', () => {
  it.each(Object.entries(TABLES))('%s locks only the identifying column', (file, lists) => {
    const src = readFileSync(resolve(process.cwd(), 'src', file), 'utf8');
    const named = /label: (?:'[^']+'|"[^"]+")/;
    const locked = src.split('\n').filter((line) => /alwaysOn: true/.test(line) && named.test(line));
    expect(locked).toHaveLength(lists);
  });
});
