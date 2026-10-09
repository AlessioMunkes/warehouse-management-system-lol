// ─────────────────────────────────────────────────────────────
// client/src/routes/pages.jsx
//
// What each route in routeTable.js shows, keyed by the table's ids.
// Its own module so App.jsx exports only a component (this project
// treats react-refresh/only-export-components as an error) and so
// AppRoutes.test.js can check the two maps line up.
//
// EACH SCREEN IS LOADED WHEN IT IS FIRST OPENED
// Everything used to be one 3 MB file (900 kB compressed), so a phone
// on the floor downloaded the manager's charts, the spreadsheet
// importer and every admin screen before it could show the sign-in
// page. Now the first load is the shell and the page asked for; each
// other screen is a small file fetched when someone goes to it.
//
// The installed app is not slowed by this: its service worker saves
// every one of these files when the app is installed, so screens open
// from the phone, and still open with no signal.
//
// The landing and sign-in pages are part of the first file, since they
// are the first thing anyone sees.
// ─────────────────────────────────────────────────────────────
import { lazy } from 'react';
import LandingPage                 from '../pages/LandingPage';
import LoginPage                   from '../pages/LoginPage';
import { DonationDraftProvider }   from '../features/donation/DonationDraftProvider';

// What each lazily loaded screen is fetched from. Exported so a test can
// check a route still leads to the page it should.
// eslint-disable-next-line react-refresh/only-export-components
export const PAGE_LOADERS = {
  guestLogin:       () => import('../pages/GuestLoginPage'),
  financePublic:    () => import('../pages/PublicFinanceReportPage'),
  section18aForm:   () => import('../pages/Section18AFormPage'),
  inviteAccept:     () => import('../pages/InviteAcceptPage'),
  resetPassword:    () => import('../pages/ResetPasswordPage'),
  slipPreview:      () => import('../pages/SlipPreviewPage'),

  managerDashboard: () => import('../pages/ManagerDashboardPage'),
  adminDashboard:   () => import('../pages/AdminDashboardPage'),
  staffHome:        () => import('../pages/TaskDashboardPage'),

  purchaseOrders:   () => import('../pages/PurchaseOrdersPage'),
  receipts:         () => import('../pages/ReceiptsPage'),
  inventory:        () => import('../pages/InventoryManagementPage'),
  stockLedger:      () => import('../pages/StockLedgerPage'),
  pickingSlips:     () => import('../pages/PickingSlipManagementPage'),
  beneficiaries:    () => import('../pages/BeneficiaryDirectoryPage'),
  collectionReminders: () => import('../pages/EcdCollectionRemindersPage'),
  operatingCalendar: () => import('../pages/OperatingCalendarPage'),

  receiving:        () => import('../pages/ReceivingPage'),
  deliveries:       () => import('../pages/StaffDeliveriesPage'),
  packing:          () => import('../pages/PackingStaffPage'),
  decanting:        () => import('../pages/DecantingPage'),
  decantingRecords: () => import('../pages/StaffDecantingRecordsPage'),
  dispatch:         () => import('../pages/DispatchPage'),
  dispatchHistory:  () => import('../pages/StaffDispatchHistoryPage'),
  donationIntake:   () => import('../pages/DonationDetailsPage').then((m) => ({ default: m.DonationDetailsPage })),
  donationReview:   () => import('../pages/ReviewPage').then((m) => ({ default: m.ReviewPage })),

  floorRequests:    () => import('../pages/StaffCommunityRequestsPage'),
  floorFeedTheSoil: () => import('../pages/StaffFeedTheSoilPage'),
  communityRequests: () => import('../pages/CommunityRequestsPage'),
  feedTheSoil:      () => import('../pages/FeedTheSoilPage'),
  volunteerEvents:  () => import('../pages/VolunteerEventsPage'),
  volunteerEvent:   () => import('../pages/VolunteerEventWorkspacePage'),
  reporting:        () => import('../pages/ReportingPage'),
  impactReport:     () => import('../pages/ImpactReportPage'),

  users:            () => import('../pages/UserDirectoryPage'),
  products:         () => import('../pages/ProductManagementPage'),
  suppliers:        () => import('../pages/SupplierDirectoryPage'),
  activityLog:      () => import('../pages/AdminActivityLogPage'),
  archive:          () => import('../pages/AdminArchivePage'),
  messageHistory:   () => import('../pages/MessageHistoryPage'),
  donationManagement: () => import('../pages/DonationManagementPage'),
  section18a:       () => import('../pages/Section18AManagementPage'),
  settings:         () => import('../pages/SettingsPage'),
  financeReport:    () => import('../pages/FinanceWarehouseReportPage'),

  guestHome:        () => import('../pages/GuestHomePage'),
  guestPack:        () => import('../pages/GuestPackPage'),
  guestDone:        () => import('../pages/GuestDonePage'),
};

// A file that will not load is tried once more before the screen gives
// up: a phone that has just come back into range often fails the first.
const once = (load) => () => load().catch(() => load());

const L = Object.fromEntries(Object.entries(PAGE_LOADERS).map(([id, load]) => [id, lazy(once(load))]));

// A route here with no entry in the table, or the other way round,
// fails AppRoutes.test.js.
// Not a component module, so fast refresh reloads the page when this
// changes — the rule's warning, and the right behaviour for a route map.
// eslint-disable-next-line react-refresh/only-export-components
export const PAGES = {
  landing:          <LandingPage />,
  login:            <LoginPage />,
  guestLogin:       <L.guestLogin />,
  financePublic:    <L.financePublic />,
  section18aForm:   <L.section18aForm />,
  inviteAccept:     <L.inviteAccept />,
  resetPassword:    <L.resetPassword />,
  slipPreview:      <L.slipPreview />,

  managerDashboard: <L.managerDashboard />,
  adminDashboard:   <L.adminDashboard />,
  staffHome:        <L.staffHome />,

  purchaseOrders:   <L.purchaseOrders />,
  receipts:         <L.receipts />,
  inventory:        <L.inventory />,
  stockLedger:      <L.stockLedger />,
  pickingSlips:     <L.pickingSlips />,
  beneficiaries:    <L.beneficiaries />,
  collectionReminders: <L.collectionReminders />,
  operatingCalendar: <L.operatingCalendar />,

  receiving:        <L.receiving />,
  deliveries:       <L.deliveries />,
  packing:          <L.packing />,
  packingDetail:    <L.packing />,
  decanting:        <L.decanting />,
  decantingRecords: <L.decantingRecords />,
  dispatch:         <L.dispatch />,
  dispatchHistory:  <L.dispatchHistory />,
  // Each intake page gets its own draft provider, so the saved draft
  // only lives while you are on the intake pages.
  donationIntake:   <DonationDraftProvider><L.donationIntake /></DonationDraftProvider>,
  donationReview:   <DonationDraftProvider><L.donationReview /></DonationDraftProvider>,

  floorRequests:    <L.floorRequests />,
  floorFeedTheSoil: <L.floorFeedTheSoil />,
  communityRequests: <L.communityRequests />,
  feedTheSoil:      <L.feedTheSoil />,
  volunteerEvents:  <L.volunteerEvents />,
  volunteerEvent:   <L.volunteerEvent />,
  reporting:        <L.reporting />,
  impactReport:     <L.impactReport />,

  users:            <L.users />,
  products:         <L.products />,
  suppliers:        <L.suppliers />,
  activityLog:      <L.activityLog />,
  archive:          <L.archive />,
  messageHistory:   <L.messageHistory />,
  donationManagement: <L.donationManagement />,
  section18a:       <L.section18a />,
  emailIntegration: <L.settings defaultSection="email" />,
  settings:         <L.settings />,
  financeReport:    <L.financeReport />,

  guestHome:        <L.guestHome />,
  guestPack:        <L.guestPack />,
  guestDone:        <L.guestDone />,
};

export default PAGES;
