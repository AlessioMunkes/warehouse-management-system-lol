// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/widgetCatalog.jsx
//
// Every widget the manager and admin dashboards can show. The page
// holds only a list of ids (useDashboardLayout); everything about a
// widget — who may have it, what data it reads, how it draws — is
// here, so adding one is one entry in this file.
//
// TWO BOARDS, LITTLE OVERLAP
// A manager runs the warehouse: stock, orders, the floor, the gate,
// the centres, volunteers on events. An admin looks after what that
// is built on: accounts, the catalogue, suppliers, donations and
// Section 18A, email, finance, the door log. So every widget belongs
// to one role. `roles` decides which board may offer it. It is not
// access control — every figure is behind requireRole on the server —
// it is not offering someone a tile about work that isn't theirs.
//
// KINDS AND SIZES
//   tile  — one number linking to where you act on it  (small)
//   panel — a chart or list in the grid below          (medium)
//   panel with `wide` — spans both columns              (large)
//
// WHERE THE NUMBERS COME FROM
// `needs` names shared sources the board fetches once (SOURCES in
// CustomisableDashboard) — the widget shows when they have loaded.
// `wants` are fetched too, but the widget draws without them.
// Chart panels (`report(...)`) run an existing Operations report and
// draw it with the Operations page's own Recharts chart, so a figure
// here matches the reporting page exactly. Every report panel gets
// the Month / 3 months / Year menu.
// ─────────────────────────────────────────────────────────────
import {
  ClipboardList, FileBadge, Gift, HandHeart, Mail, Package,
  PackageSearch, ScrollText, Truck, Users2, Warehouse,
} from 'lucide-react';
import StatTile from './components/StatTile';
import ActionCard from './components/ActionCard';
import ReportPanel from './components/ReportPanel';
import StaticChart from './components/StaticChart';
import NotificationsPanel from './components/NotificationsPanel';
import { STAFF, ADMIN } from '../../routes/paths';
import { RAG, byLabel } from './chartTheme';

const MANAGER = 'manager';
const ADMIN_ROLE = 'admin';
const MANAGER_ONLY = [MANAGER];
const MANAGERS_AND_ADMINS = [MANAGER, 'admin'];
const ADMIN_ONLY = [ADMIN_ROLE];

const INVENTORY = '/noc/inventory';

const tile = (def) => ({ kind: 'tile', ...def });
const report = (def) => ({
  kind: 'panel',
  periods: true,
  render: ({ period }) => <ReportPanel def={def} period={period} />,
  ...def,
});

export const WIDGETS = [
  // ═══ Both: notifications ═════════════════════════════════════
  {
    id: 'notifications', kind: 'panel', title: 'Notifications', roles: MANAGERS_AND_ADMINS,
    description: 'Your latest notifications. Click one to open where it needs dealing with.',
    render: () => <NotificationsPanel />,
  },

  // ═══ Manager: number tiles ═══════════════════════════════════
  tile({
    id: 'low-stock', title: 'Low or out of stock', roles: MANAGER_ONLY, needs: ['summary'],
    description: 'Products at or below their reorder level, or with nothing available.',
    render: ({ summary }) => (
      <StatTile image="low-stock" label="Low or out of stock" value={summary.lowStockCount}
        to={`${INVENTORY}?status=lowstock`} warn />
    ),
  }),
  tile({
    id: 'open-pos', title: 'Open purchase orders', roles: MANAGER_ONLY, needs: ['summary'],
    description: 'Orders not yet completed or returned, including ones needing follow-up.',
    render: ({ summary }) => (
      <StatTile image="open-pos" label="Open purchase orders" value={summary.openPurchaseOrders} to={STAFF.purchaseOrders} />
    ),
  }),
  tile({
    id: 'dispatches-today', title: 'Pallets due out today', roles: MANAGER_ONLY, needs: ['summary'],
    description: 'Packed pallets due to be collected today and not yet collected.',
    render: ({ summary }) => (
      <StatTile image="pallets-out" label="Pallets due out today" value={summary.pendingDispatchesToday} to={`${STAFF.pickingSlips}?status=ready`} />
    ),
  }),
  tile({
    id: 'deliveries-today', title: 'Deliveries expected today', roles: MANAGER_ONLY, needs: ['summary'],
    description: 'Open purchase orders with today as the expected delivery date.',
    render: ({ summary }) => (
      <StatTile image="deliveries-expected" label="Deliveries expected today" value={summary.deliveriesExpectedToday} to={`${STAFF.purchaseOrders}?status=in_transit`} />
    ),
  }),
  tile({
    id: 'slips-to-pack', title: 'Slips still to pack', roles: MANAGER_ONLY, needs: ['myWork'],
    description: 'Picking slips due today or earlier that have not been packed.',
    render: ({ myWork }) => (
      <StatTile icon={ClipboardList} label="Slips still to pack" value={myWork.slipsToPack} to={STAFF.pickingSlips} warn />
    ),
  }),
  tile({
    id: 'pallets-at-gate', title: 'Pallets waiting at the gate', roles: MANAGER_ONLY, needs: ['myWork'],
    description: 'Packed pallets due today or earlier that have not been collected.',
    render: ({ myWork }) => (
      <StatTile icon={Warehouse} label="Pallets waiting at the gate" value={myWork.palletsAtGate} to={`${STAFF.pickingSlips}?status=ready`} />
    ),
  }),
  tile({
    id: 'benevolent', title: 'Pending benevolent requests', roles: MANAGER_ONLY, needs: ['summary'],
    description: 'Food parcel requests that have not been dealt with yet.',
    render: ({ summary }) => (
      <StatTile image="pending-benevolent-requests" label="Pending benevolent requests" value={summary.pendingCommunityRequests}
        to={STAFF.communityRequests} warn />
    ),
  }),

  // ═══ Manager: charts ═════════════════════════════════════════
  {
    id: 'product-health', kind: 'panel', title: 'Product health', roles: MANAGER_ONLY, needs: ['summary'],
    description: 'Active products split into healthy, low and out of stock.',
    render: ({ summary }) => (
      <StaticChart
        unit="products" hint="donut" description="Product health"
        colorFor={byLabel({ 'Healthy stock': RAG.good, 'Low stock': RAG.warn, 'Out of stock': RAG.bad })}
        series={[
          { label: 'Healthy stock', value: summary.healthyStockCount },
          { label: 'Low stock', value: summary.belowReorderCount },
          { label: 'Out of stock', value: summary.outOfStockCount },
        ]}
      />
    ),
  },
  report({
    id: 'top-products', title: 'Most dispatched products', roles: MANAGER_ONLY, wide: true,
    description: 'The products sent out most, in kilograms.',
    defaultPeriod: 'month',
    spec: { metric: 'dispatch_volume', dimension: 'product' }, hint: 'hbar', top: 5,
    emptyText: 'Nothing dispatched in this period yet.',
  }),
  report({
    id: 'by-beneficiary', title: 'Dispatched by beneficiary type', roles: MANAGER_ONLY,
    description: 'Kilograms split between ECDs, soup kitchens, dignity kitchens and community.',
    defaultPeriod: 'month',
    spec: { metric: 'dispatch_volume', dimension: 'beneficiary' }, hint: 'donut',
    emptyText: 'Nothing dispatched in this period yet.',
  }),
  report({
    id: 'dispatch-trend', title: 'Food dispatched', roles: MANAGER_ONLY, wide: true,
    description: 'Kilograms sent out over time.',
    spec: { metric: 'dispatch_volume', dimension: 'month' }, weekly: true, hint: 'bar',
  }),
  report({
    id: 'spend-by-supplier', title: 'Spend by supplier', roles: MANAGER_ONLY,
    description: 'Which suppliers purchase orders went to.',
    defaultPeriod: '3m',
    spec: { metric: 'procurement_spend', dimension: 'supplier' }, hint: 'hbar', top: 6,
  }),
  report({
    id: 'compliance-trend', title: 'Collection compliance', roles: MANAGER_ONLY,
    description: 'The share of scheduled collections that were actually collected — green at or above target, amber just under, red well under.',
    spec: { metric: 'collection_compliance', dimension: 'month' }, hint: 'bar',
    rag: true,
  }),
  report({
    id: 'wastage-trend', title: 'Decanting wastage', roles: MANAGER_ONLY,
    description: 'Wastage recorded while decanting — green within the limit, amber just over, red well over.',
    spec: { metric: 'decanting_wastage', dimension: 'month' }, weekly: true, hint: 'bar',
    rag: true,
  }),
  report({
    id: 'volunteer-trend', title: 'Volunteer hours', roles: MANAGER_ONLY,
    description: 'Hours volunteers spent on site at events, over time.',
    spec: { metric: 'volunteer_hours', dimension: 'month' }, weekly: true, hint: 'bar',
  }),

  // ═══ Admin: number tiles ═════════════════════════════════════
  tile({
    id: 'users', title: 'Active user accounts', roles: ADMIN_ONLY, needs: ['users'],
    description: 'Staff accounts that can sign in.',
    render: ({ users }) => (
      <StatTile icon={Users2} label="Active user accounts" value={users.filter((u) => u.isActive).length} to={ADMIN.users} />
    ),
  }),
  tile({
    id: 'donation-queue', title: 'Donation queue', roles: ADMIN_ONLY, needs: ['donations'],
    description: 'Donations and flagged items waiting in the classification queue.',
    render: ({ donations }) => (
      <StatTile icon={Gift} label="Donation queue" value={donations} to={ADMIN.donationManagement} warn />
    ),
  }),
  tile({
    id: 'certificates-to-issue', title: 'Certificates to issue', roles: ADMIN_ONLY, needs: ['s18a'],
    description: 'Section 18A certificates queued and ready to be issued to donors.',
    render: ({ s18a }) => (
      <StatTile icon={FileBadge} label="Section 18A certificates to issue" value={s18a.queued ?? 0}
        to={ADMIN.section18aManagement} warn />
    ),
  }),
  tile({
    id: 'awaiting-donor', title: 'Waiting on donor details', roles: ADMIN_ONLY, needs: ['s18a'],
    description: 'Donations that qualify for a certificate but still need the donor’s details.',
    render: ({ s18a }) => (
      <StatTile icon={ScrollText} label="Certificates waiting on donor details" value={s18a.qualifying_pending_donor ?? 0}
        to={ADMIN.section18aManagement} />
    ),
  }),
  tile({
    id: 'email-status', title: 'Email sending', roles: ADMIN_ONLY, needs: ['gmail'],
    description: 'Whether the account that sends certificates, reminders and Finance emails is connected.',
    render: ({ gmail }) => (
      <StatTile icon={Mail} label={gmail.connected ? 'Email sending connected' : 'Email sending is off — reconnect'}
        value={gmail.connected ? 'On' : 'Off'} to={ADMIN.emailIntegration} alarm={!gmail.connected} />
    ),
  }),
  tile({
    id: 'catalogue-gaps', title: 'Products missing details', roles: ADMIN_ONLY, needs: ['products'],
    description: 'Active products with no unit cost or no weight, so order estimates cannot be worked out for them.',
    render: ({ products }) => (
      <StatTile icon={PackageSearch} label="Products missing a cost or weight"
        value={products.filter((p) => p.isActive && (p.unitCost == null || p.weightKg == null)).length}
        to={ADMIN.products} warn />
    ),
  }),
  tile({
    id: 'active-products', title: 'Active products', roles: ADMIN_ONLY, needs: ['products'],
    description: 'Products currently in the catalogue.',
    render: ({ products }) => (
      <StatTile icon={Package} label="Active products" value={products.filter((p) => p.isActive).length} to={ADMIN.products} />
    ),
  }),
  tile({
    id: 'active-suppliers', title: 'Active suppliers', roles: ADMIN_ONLY, needs: ['suppliers'],
    description: 'Suppliers the warehouse can raise orders with.',
    render: ({ suppliers }) => (
      <StatTile icon={Truck} label="Active suppliers" value={suppliers.filter((s) => s.isActive).length} to={ADMIN.suppliers} />
    ),
  }),
  tile({
    id: 'on-site-now', title: 'Visitors signed in now', roles: ADMIN_ONLY, needs: ['visits'],
    description: 'Guests signed in at the door who have not signed out.',
    render: ({ visits }) => (
      <StatTile icon={HandHeart} label="Visitors signed in now" value={visits.filter((v) => !v.signedOutAt).length} to={ADMIN.volunteerLog} />
    ),
  }),

  // ═══ Admin: charts ═══════════════════════════════════════════
  {
    id: 'users-by-role', kind: 'panel', title: 'Accounts by role', roles: ADMIN_ONLY, needs: ['users'],
    description: 'Active accounts split between warehouse staff, managers and admins.',
    render: ({ users }) => {
      const count = (r) => users.filter((u) => u.isActive && u.role === r).length;
      return (
        <StaticChart
          unit="accounts" hint="donut" description="Accounts by role"
          series={[
            { label: 'Warehouse staff', value: count('warehouse_worker') },
            { label: 'Managers', value: count('manager') },
            { label: 'Admins', value: count('admin') },
          ]}
        />
      );
    },
  },
  report({
    id: 's18a-pipeline', title: 'Section 18A pipeline', roles: ADMIN_ONLY,
    description: 'Donations by certificate status: waiting on the donor, queued, issued.',
    defaultPeriod: 'year',
    spec: { metric: 'section18a_pipeline', dimension: 's18a_status' }, hint: 'donut',
    // Plain words, in the order a donation moves through, one colour
    // per status by what it asks of the admin: green done, amber ready
    // for you to issue, blue waiting on the donor, purple not yet
    // assessed, and a soft grey for the ones that are not certificate
    // cases at all — context, so it steps back instead of filling the ring.
    labels: {
      issued: 'Issued',
      queued: 'Ready to issue',
      qualifying_pending_donor: 'Waiting on donor details',
      not_evaluated: 'Not yet assessed',
      not_qualifying: 'Not a certificate case',
    },
    order: ['Issued', 'Ready to issue', 'Waiting on donor details', 'Not yet assessed', 'Not a certificate case'],
    colorFor: byLabel({
      'Issued': RAG.good,
      'Ready to issue': RAG.warn,
      'Waiting on donor details': RAG.waiting,
      'Not yet assessed': RAG.todo,
      'Not a certificate case': RAG.muted,
    }),
  }),
  report({
    id: 'donation-trend', title: 'Donation value', roles: ADMIN_ONLY, wide: true,
    description: 'The value of donations received over time.',
    spec: { metric: 'donation_value', dimension: 'month' }, hint: 'bar',
  }),
  report({
    id: 'donation-by-category', title: 'Donations by category', roles: ADMIN_ONLY,
    description: 'Where donated value came from, by category.',
    defaultPeriod: 'year',
    spec: { metric: 'donation_value', dimension: 'category' }, hint: 'donut',
  }),
  report({
    id: 'spend-trend', title: 'Procurement spend', roles: ADMIN_ONLY, wide: true,
    description: 'What was spent on purchase orders over time — the Finance view.',
    spec: { metric: 'procurement_spend', dimension: 'month' }, hint: 'bar',
  }),
  {
    id: 'admin-shortcuts', kind: 'panel', title: 'Admin shortcuts', roles: ADMIN_ONLY, wide: true,
    // `wants`, not `needs`: the badge is advisory, and the links must
    // still show if the donation count cannot be loaded.
    wants: ['donations'],
    description: 'Quick links to users, the catalogue and donations.',
    render: ({ donations }) => (
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard to={ADMIN.users} icon={Users2} title="Users"
          description="Create accounts, set roles, deactivate someone who has left." />
        <ActionCard to={ADMIN.volunteerLog} icon={HandHeart} title="Volunteer log"
          description="See who signed in at the door and sign out open visits." />
        <ActionCard to={ADMIN.products} icon={Package} title="Products"
          description="Add and edit the products the warehouse stocks." />
        <ActionCard to={ADMIN.suppliers} icon={Truck} title="Suppliers"
          description="Manage suppliers and their agreements." />
        <ActionCard to={ADMIN.donationManagement} icon={Gift} title="Classification queue"
          description="Review donations and flagged items that need a decision."
          badge={donations > 0 ? `Needs attention (${donations})` : null} />
        <ActionCard to={ADMIN.section18aManagement} icon={ScrollText} title="Section 18A"
          description="Issue tax certificates for qualifying donations." />
      </div>
    ),
  },
];

const byId = new Map(WIDGETS.map((w) => [w.id, w]));
export const getWidget = (id) => byId.get(id) ?? null;
export const widgetsForRole = (role) => WIDGETS.filter((w) => w.roles.includes(role));

// How much room a widget takes, in the words the Add dialog uses.
export const SIZES = ['small', 'medium', 'large'];
export const sizeOf = (w) => (w.kind === 'tile' ? 'small' : w.wide ? 'large' : 'medium');

// What each dashboard starts with, and what Reset goes back to.
export const DEFAULT_LAYOUT = {
  [MANAGER]: [
    'low-stock', 'open-pos', 'dispatches-today', 'deliveries-today', 'benevolent',
    'top-products', 'product-health', 'by-beneficiary', 'dispatch-trend',
  ],
  [ADMIN_ROLE]: [
    'users', 'donation-queue', 'certificates-to-issue', 'email-status', 'catalogue-gaps',
    'admin-shortcuts', 's18a-pipeline', 'users-by-role', 'donation-trend',
  ],
};
