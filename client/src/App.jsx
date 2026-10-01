import { BrowserRouter, Routes, Route, Navigate }  from 'react-router-dom';
import { AuthProvider }                            from './context/AuthContext';
import ThemeProvider                               from './components/layout/ThemeProvider';
import ProtectedRoute                              from './components/layout/ProtectedRoute';
import { PACKING, STAFF, DONATIONS, DONATION_INTAKE_ROLES, ADMIN, VOLUNTEERS, VOLUNTEER_MANAGEMENT_ROLES, COMMUNITY_REQUEST_ROLES, STAFF_ROLES, FEED_THE_SOIL_ROLES } from './routes/paths';
import LandingPage                                 from './pages/LandingPage';
import LoginPage                                   from './pages/LoginPage';
import GuestLoginPage                              from './pages/GuestLoginPage';
import GuestHomePage                               from './pages/GuestHomePage';
import GuestPackPage                               from './pages/GuestPackPage';
import GuestDonePage                               from './pages/GuestDonePage';
import SlipPreviewPage                             from './pages/SlipPreviewPage';
import PageNotFound                               from "./pages/PageNotFound";

import ProcurementPage                             from './pages/ProcurementPage';
import StaffDeliveriesPage                         from './pages/StaffDeliveriesPage';
import DecantingPage                               from './pages/DecantingPage';
import StaffDecantingRecordsPage                   from './pages/StaffDecantingRecordsPage';
import PackingSelectPage                           from './pages/PackingSelectPage';
import DispatchPage                                from './pages/DispatchPage';
import StaffDispatchHistoryPage                    from './pages/StaffDispatchHistoryPage';
import ReceiptsPage                                from './pages/ReceiptsPage';
import InventoryManagementPage                     from './pages/InventoryManagementPage';
import ManagerDashboardPage                         from './pages/ManagerDashboardPage';
import { ToastProvider }                             from './components/ui/toast';
import StockLedgerPage                               from './pages/StockLedgerPage';
import AdminActivityScreen                         from './pages/AdminActivityScreen';
import TaskDashboard from './pages/TaskDashboardPage';
import SupplierDirectoryPage                       from './pages/SupplierDirectoryPage';
import PurchaseOrdersPage                          from './pages/PurchaseOrdersPage';
import ReportingPage                               from './pages/ReportingPage';
import DonationManagementPage                      from './pages/DonationManagementPage';
import Section18AManagementPage                    from './pages/Section18AManagementPage';
import BeneficiaryDirectoryPage                     from './pages/BeneficiaryDirectoryPage';
import EcdCollectionRemindersPage                  from './pages/EcdCollectionRemindersPage';
import ImpactReportPage                             from './pages/ImpactReportPage';
import PickingSlipManagementPage                    from './pages/PickingSlipManagementPage';
import UserDirectoryPage                            from './pages/UserDirectoryPage';
import VolunteerManagementPage                      from './pages/VolunteerManagementPage';
import AdminUserActivityPage                        from './pages/AdminUserActivityPage';
import AdminArchivePage                             from './pages/AdminArchivePage';
import ProductManagementPage                        from './pages/ProductManagementPage';
import VolunteerEventsPage                        from './pages/VolunteerEventsPage';
import VolunteerEventWorkspacePage                from './pages/VolunteerEventWorkspacePage';
import CommunityRequestsPage                       from './pages/CommunityRequestsPage';
import GmailSettingsPage                           from './pages/GmailSettingsPage';
import FinanceWarehouseReportPage                  from './pages/FinanceWarehouseReportPage';
import PublicFinanceReportPage                     from './pages/PublicFinanceReportPage';
import Section18AFormPage                         from './pages/Section18AFormPage';
import InviteAcceptPage                            from './pages/InviteAcceptPage';
import ResetPasswordPage                            from './pages/ResetPasswordPage';
import FeedTheSoilPage                              from './pages/FeedTheSoilPage';

import { DonationDraftProvider }                   from './features/donation/context/DonationDraftProvider';
import {DonationDetailsPage } from './pages/DonationDetailsPage';
import { ReviewPage as DonationReviewPage }         from './pages/ReviewPage';

const App = () => (
  <AuthProvider>
    {/* Outside the router so the theme applies to every screen, login included. */}
    <ThemeProvider>
    <BrowserRouter>
      <ToastProvider>
      <Routes>
        {/* Public */}
        <Route path="/"      element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guest" element={<GuestLoginPage />} />
        <Route path="/finance/report/:token" element={<PublicFinanceReportPage />} />
        <Route path="/section-18a/:token" element={<Section18AFormPage />} />
        {/* Accepting an invite: the person has no account yet. */}
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        {/* Resetting a password: the person has an account, but no
            session — same public footing as the invite route above. */}
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        {/* The page behind each pallet's QR code (BR-22). Public, so a
            volunteer can open it without an account; it only shows what
            is already printed on the pallet label. */}
        <Route path="/slip/:token" element={<SlipPreviewPage />} />

        {/* ── Admin only ───────────────────────────────────── */}
        <Route element={<ProtectedRoute roles={['admin']} shell />}>
          <Route path={ADMIN.dashboard} element={<AdminActivityScreen />} />
          <Route path={ADMIN.suppliers} element={<SupplierDirectoryPage />} />
          <Route path={ADMIN.products}  element={<ProductManagementPage />} />
          <Route path={ADMIN.donationManagement} element={<DonationManagementPage />} />
          <Route path={ADMIN.section18aManagement} element={<Section18AManagementPage />} />
          <Route path={ADMIN.users} element={<UserDirectoryPage />} />
          {/* The Gmail account donation emails are sent from. */}
          <Route path={ADMIN.emailIntegration} element={<GmailSettingsPage />} />
          <Route path={ADMIN.financeReport} element={<FinanceWarehouseReportPage />} />
          {/* The door sign-in log. Managers use the volunteer events
              screen (/volunteers) instead. */}
          <Route path={ADMIN.volunteerLog} element={<VolunteerManagementPage />} />
          <Route path={ADMIN.activity} element={<AdminUserActivityPage />} />
          <Route path={ADMIN.archive} element={<AdminArchivePage />} />
        </Route>

        {/* ── Managers and admins ─────────────────────────────
            ProtectedRoute has no admin override, so admin is listed
            explicitly wherever admins are allowed. */}
        <Route element={<ProtectedRoute roles={['manager', 'admin']} shell />}>
          <Route path="/manager"       element={<ManagerDashboardPage />} />
        <Route path="/noc/inventory" element={<InventoryManagementPage />} />
          <Route path={STAFF.stockLedger} element={<StockLedgerPage />} />
          <Route path={STAFF.reporting} element={<ReportingPage />} />
          <Route path={STAFF.impactReport} element={<ImpactReportPage />} />
          <Route path={STAFF.purchaseOrders} element={<PurchaseOrdersPage />} />
          <Route path={STAFF.receipts} element={<ReceiptsPage />} />
          <Route path={STAFF.beneficiaries} element={<BeneficiaryDirectoryPage />} />
          <Route path={STAFF.collectionReminders} element={<EcdCollectionRemindersPage />} />
          <Route path={STAFF.pickingSlips} element={<PickingSlipManagementPage />} />
        </Route>

        {/* ── Warehouse floor: workers, managers and admins ────
            These pages bring their own layout (StaffShell), so there is
            no shell prop. Guests are not allowed here. */}
        <Route element={<ProtectedRoute roles={STAFF_ROLES} />}>
          <Route path="/noc" element={<TaskDashboard />} />
          <Route path="/noc/decanting" element={<DecantingPage />} />
          <Route path={STAFF.decantingRecords} element={<StaffDecantingRecordsPage />} />

          {/* One URL per task: each page shows the manager view or the
              staff flow depending on the role. */}
          <Route path={STAFF.receiving}       element={<ProcurementPage />} />
          <Route path={STAFF.deliveries}      element={<StaffDeliveriesPage />} />
          <Route path={PACKING.board}         element={<PackingSelectPage />} />
          <Route path={PACKING.detailPattern} element={<PackingSelectPage />} />
          <Route path={STAFF.dispatch}        element={<DispatchPage />} />
          <Route path={STAFF.dispatchHistory} element={<StaffDispatchHistoryPage />} />
        </Route>

        {/* ── Donation intake: workers and admins ─────────────
            Each page gets its own draft provider, so the saved draft only
            lives while you're on the intake pages. */}
        <Route element={<ProtectedRoute roles={DONATION_INTAKE_ROLES} />}>
          <Route
            path={STAFF.donation}
            element={
              <DonationDraftProvider>
                <DonationDetailsPage />
              </DonationDraftProvider>
            }
          />
          <Route
            path={DONATIONS.review}
            element={
              <DonationDraftProvider>
                <DonationReviewPage />
              </DonationDraftProvider>
            }
          />
        </Route>

        {/* ── Volunteer events: managers and admins ─────────── */}
        <Route element={<ProtectedRoute roles={VOLUNTEER_MANAGEMENT_ROLES} shell />}>
          <Route path={VOLUNTEERS.events} element={<VolunteerEventsPage />} />
          <Route path={VOLUNTEERS.eventPattern} element={<VolunteerEventWorkspacePage />} />
        </Route>

        {/* ── Benevolent requests and Feed the Soil: all staff ──
            Both pages choose their own layout by role. */}
        <Route element={<ProtectedRoute roles={COMMUNITY_REQUEST_ROLES} />}>
          <Route path={STAFF.communityRequests} element={<CommunityRequestsPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={FEED_THE_SOIL_ROLES} />}>
          <Route path={STAFF.feedTheSoil} element={<FeedTheSoilPage />} />
        </Route>

        {/* ── Guests (Love Activist volunteers) ─────────────── */}
        <Route element={<ProtectedRoute roles={['guest']} />}>
          <Route path="/guest-home"  element={<GuestHomePage />} />
          <Route path="/guest/pack"  element={<GuestPackPage />} />
          <Route path="/guest/done"  element={<GuestDonePage />} />
        </Route>

        {/* Old URLs that still get linked to. */}
        <Route path="/inventory" element={<Navigate to="/noc/inventory" replace />} />
        <Route path="/decanting" element={<Navigate to="/noc/decanting" replace />} />
        <Route path="/programmes/noc/packing"
               element={<Navigate to={PACKING.board} replace />} />
        <Route path="/programmes/noc/packing/:slipId"
               element={<Navigate to={PACKING.board} replace />} />

        {/* Catch-all */}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
      </ToastProvider>
    </BrowserRouter>
    </ThemeProvider>
  </AuthProvider>
);

export default App;
