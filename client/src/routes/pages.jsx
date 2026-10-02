// ─────────────────────────────────────────────────────────────
// client/src/routes/pages.jsx
//
// What each route in routeTable.js shows, keyed by the table's ids.
// Its own module so App.jsx exports only a component (this project
// treats react-refresh/only-export-components as an error) and so
// AppRoutes.test.js can check the two maps line up.
// ─────────────────────────────────────────────────────────────
import LandingPage                                 from '../pages/LandingPage';
import LoginPage                                   from '../pages/LoginPage';
import GuestLoginPage                              from '../pages/GuestLoginPage';
import GuestHomePage                               from '../pages/GuestHomePage';
import GuestPackPage                               from '../pages/GuestPackPage';
import GuestDonePage                               from '../pages/GuestDonePage';
import SlipPreviewPage                             from '../pages/SlipPreviewPage';

import ProcurementPage                             from '../pages/ProcurementPage';
import StaffDeliveriesPage                         from '../pages/StaffDeliveriesPage';
import DecantingPage                               from '../pages/DecantingPage';
import StaffDecantingRecordsPage                   from '../pages/StaffDecantingRecordsPage';
import PackingSelectPage                           from '../pages/PackingSelectPage';
import DispatchPage                                from '../pages/DispatchPage';
import StaffDispatchHistoryPage                    from '../pages/StaffDispatchHistoryPage';
import ReceiptsPage                                from '../pages/ReceiptsPage';
import InventoryManagementPage                     from '../pages/InventoryManagementPage';
import ManagerDashboardPage                        from '../pages/ManagerDashboardPage';
import StockLedgerPage                             from '../pages/StockLedgerPage';
import AdminDashboardPage                          from '../pages/AdminDashboardPage';
import TaskDashboard                               from '../pages/TaskDashboardPage';
import SupplierDirectoryPage                       from '../pages/SupplierDirectoryPage';
import PurchaseOrdersPage                          from '../pages/PurchaseOrdersPage';
import ReportingPage                               from '../pages/ReportingPage';
import DonationManagementPage                      from '../pages/DonationManagementPage';
import Section18AManagementPage                    from '../pages/Section18AManagementPage';
import BeneficiaryDirectoryPage                    from '../pages/BeneficiaryDirectoryPage';
import EcdCollectionRemindersPage                  from '../pages/EcdCollectionRemindersPage';
import ImpactReportPage                            from '../pages/ImpactReportPage';
import PickingSlipManagementPage                   from '../pages/PickingSlipManagementPage';
import UserDirectoryPage                           from '../pages/UserDirectoryPage';
import VolunteerManagementPage                     from '../pages/VolunteerManagementPage';
import AdminUserActivityPage                       from '../pages/AdminUserActivityPage';
import MessageHistoryPage                          from '../pages/MessageHistoryPage';
import AdminArchivePage                            from '../pages/AdminArchivePage';
import ProductManagementPage                       from '../pages/ProductManagementPage';
import VolunteerEventsPage                         from '../pages/VolunteerEventsPage';
import VolunteerEventWorkspacePage                 from '../pages/VolunteerEventWorkspacePage';
import CommunityRequestsPage                       from '../pages/CommunityRequestsPage';
import SettingsPage                                from '../pages/SettingsPage';
import FinanceWarehouseReportPage                  from '../pages/FinanceWarehouseReportPage';
import PublicFinanceReportPage                     from '../pages/PublicFinanceReportPage';
import Section18AFormPage                          from '../pages/Section18AFormPage';
import InviteAcceptPage                            from '../pages/InviteAcceptPage';
import ResetPasswordPage                           from '../pages/ResetPasswordPage';
import FeedTheSoilPage                             from '../pages/FeedTheSoilPage';

import { DonationDraftProvider }                   from '../features/donation/context/DonationDraftProvider';
import { DonationDetailsPage }                     from '../pages/DonationDetailsPage';
import { ReviewPage as DonationReviewPage }        from '../pages/ReviewPage';

// A route here with no entry in the table, or the other way round,
// fails AppRoutes.test.js.
// Not a component module, so fast refresh reloads the page when this
// changes — the rule's warning, and the right behaviour for a route map.
// eslint-disable-next-line react-refresh/only-export-components
export const PAGES = {
  landing:          <LandingPage />,
  login:            <LoginPage />,
  guestLogin:       <GuestLoginPage />,
  financePublic:    <PublicFinanceReportPage />,
  section18aForm:   <Section18AFormPage />,
  inviteAccept:     <InviteAcceptPage />,
  resetPassword:    <ResetPasswordPage />,
  slipPreview:      <SlipPreviewPage />,

  managerDashboard: <ManagerDashboardPage />,
  adminDashboard:   <AdminDashboardPage />,
  staffHome:        <TaskDashboard />,

  purchaseOrders:   <PurchaseOrdersPage />,
  receipts:         <ReceiptsPage />,
  inventory:        <InventoryManagementPage />,
  stockLedger:      <StockLedgerPage />,
  pickingSlips:     <PickingSlipManagementPage />,
  beneficiaries:    <BeneficiaryDirectoryPage />,
  collectionReminders: <EcdCollectionRemindersPage />,

  receiving:        <ProcurementPage />,
  deliveries:       <StaffDeliveriesPage />,
  packing:          <PackingSelectPage />,
  packingDetail:    <PackingSelectPage />,
  decanting:        <DecantingPage />,
  decantingRecords: <StaffDecantingRecordsPage />,
  dispatch:         <DispatchPage />,
  dispatchHistory:  <StaffDispatchHistoryPage />,
  // Each intake page gets its own draft provider, so the saved draft
  // only lives while you are on the intake pages.
  donationIntake:   <DonationDraftProvider><DonationDetailsPage /></DonationDraftProvider>,
  donationReview:   <DonationDraftProvider><DonationReviewPage /></DonationDraftProvider>,

  communityRequests: <CommunityRequestsPage />,
  feedTheSoil:      <FeedTheSoilPage />,
  volunteerEvents:  <VolunteerEventsPage />,
  volunteerEvent:   <VolunteerEventWorkspacePage />,
  reporting:        <ReportingPage />,
  impactReport:     <ImpactReportPage />,

  users:            <UserDirectoryPage />,
  products:         <ProductManagementPage />,
  suppliers:        <SupplierDirectoryPage />,
  activity:         <AdminUserActivityPage />,
  volunteerLog:     <VolunteerManagementPage />,
  archive:          <AdminArchivePage />,
  messageHistory:   <MessageHistoryPage />,
  donationManagement: <DonationManagementPage />,
  section18a:       <Section18AManagementPage />,
  emailIntegration: <SettingsPage defaultSection="email" />,
  settings:         <SettingsPage />,
  financeReport:    <FinanceWarehouseReportPage />,

  guestHome:        <GuestHomePage />,
  guestPack:        <GuestPackPage />,
  guestDone:        <GuestDonePage />,
};

export default PAGES;
