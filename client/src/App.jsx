import { BrowserRouter, Routes, Route, Navigate }  from 'react-router-dom';
import { AuthProvider }                            from './context/AuthContext';
import ProtectedRoute                              from './components/layout/ProtectedRoute';
import { PACKING, STAFF, DONATIONS, DONATION_INTAKE_ROLES, ADMIN, VOLUNTEERS, VOLUNTEER_MANAGEMENT_ROLES, COMMUNITY_REQUEST_ROLES } from './routes/paths';
import LandingPage                                 from './pages/LandingPage';
import LoginPage                                   from './pages/LoginPage';
import GuestLoginPage                              from './pages/GuestLoginPage';
import GuestHomePage                               from './pages/GuestHomePage';
import PageNotFound                               from "./pages/PageNotFound";
//import SelectNOCjob                                from './pages/SelectNOCjob';

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
import AdminActivityScreen                         from './pages/AdminActivityScreen';
import TaskDashboard from './pages/TaskDashboardPage';
import SupplierDirectoryPage                       from './pages/SupplierDirectoryPage';
import PurchaseOrdersPage                          from './pages/PurchaseOrdersPage';
import ReportingPage                               from './pages/ReportingPage';
import CategoryRoutingRulesPage                    from './pages/CategoryRoutingRulesPage';
import DonationClassificationPage                 from './pages/DonationClassificationPage';
import EvaluateRoutingPage                         from './pages/EvaluateRoutingPage';
import DonationManagementPage                      from './pages/DonationManagementPage';
import BeneficiaryDirectoryPage                     from './pages/BeneficiaryDirectoryPage';
import ImpactReportPage                             from './pages/ImpactReportPage';
import PickingSlipManagementPage                    from './pages/PickingSlipManagementPage';
import UserDirectoryPage                            from './pages/UserDirectoryPage';
import ProductManagementPage                        from './pages/ProductManagementPage';
import DocumentsPage                                 from './pages/DocumentsPage';
import VolunteerEventsPage                        from './pages/VolunteerEventsPage';
import VolunteerEventWorkspacePage                from './pages/VolunteerEventWorkspacePage';
import CommunityRequestsPage                       from './pages/CommunityRequestsPage';

// Donations — new feature, own draft context scoped to just these
// two routes (see features/donation/context/DonationDraftProvider.jsx)
import { DonationDraftProvider }                   from './features/donation/context/DonationDraftProvider';
import {DonationDetailsPage } from './pages/DonationDetailsPage';
import { ReviewPage as DonationReviewPage }         from './pages/ReviewPage';

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/"      element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guest" element={<GuestLoginPage />} />
         
        
        {/* ── Admin only ─────────────────────────────────────
            Account provisioning and supplier master data — not
            reachable by managers, per explicit product decision this
            session (Products moved out of this block below; Users
            and Suppliers stay here). */}
        <Route element={<ProtectedRoute roles={['admin']} shell />}>
          {/* The admin landing screen. LoginPage.jsx redirects every
              admin here, and this grid is the only navigation to
              Category Routing, Donation Classification, Explain Routing
              and Donation Management. PR #52 repointed this path at
              ManagerDashboardPage and called the grid superseded — but
              that dashboard's sidebar listed none of those four, so the
              screens became URL-only. Its own Dashboard tile leads to
              ManagerDashboardPage, which is still at /manager. */}
          <Route path={ADMIN.dashboard} element={<AdminActivityScreen />} />
          <Route path={ADMIN.suppliers} element={<SupplierDirectoryPage />} />
          <Route path={ADMIN.donationManagement} element={<DonationManagementPage />} />
          {/* Account provisioning. Every route in user.routes.js is
              requireRole(ADMIN), so this was unreachable while it sat in
              a manager-only block — the client gate now matches the
              server instead of contradicting it. */}
          <Route path={ADMIN.users} element={<UserDirectoryPage />} />
          {/* These three sat outside every guard, labelled "temporary
              test access ... without login". That reached staging, where
              anyone who knew the URL could open them. The server routes
              behind them were always gated; the screens now are too. */}
          <Route path={ADMIN.categoryRouting} element={<CategoryRoutingRulesPage />} />
          <Route path={ADMIN.donationClassification} element={<DonationClassificationPage />} />
          <Route path={ADMIN.evaluateRouting} element={<EvaluateRoutingPage />} />
        </Route>

        {/* Protected — manager and admin.
            roles={['manager']} alone silently excluded admin here —
            ProtectedRoute's role check is a strict allowlist with no
            admin-bypass, so an admin account could not reach any of
            these even though every one of their server routes is
            requireRole(MANAGER, ADMIN). Fixed by listing both. */}
        {/* 'admin' added: ProtectedRoute has no admin special case, so
            roles={['manager']} was locking admins out of the manager screen,
            inventory, reporting and purchase orders — while the server has
            always treated MANAGERS_UP as [MANAGER, ADMIN]. The two now agree. */}
        <Route element={<ProtectedRoute roles={['manager', 'admin']} shell />}>
          <Route path="/manager"       element={<ManagerDashboardPage />} />
        <Route path="/noc/inventory" element={<InventoryManagementPage />} />
          <Route path={STAFF.reporting} element={<ReportingPage />} />
          <Route path={STAFF.impactReport} element={<ImpactReportPage />} />
          <Route path={STAFF.purchaseOrders} element={<PurchaseOrdersPage />} />
          {/* Past delivery notes and dispatch notes. Manager and admin only —
              the server endpoints are gated to the same pair, so the two
              cannot drift into a UI that hides a route anyone can still call. */}
          <Route path={STAFF.receipts} element={<ReceiptsPage />} />
          <Route path={STAFF.beneficiaries} element={<BeneficiaryDirectoryPage />} />
          <Route path={STAFF.pickingSlips} element={<PickingSlipManagementPage />} />
          <Route path={STAFF.documents} element={<DocumentsPage />} />
          {/* Manager-reachable but not primary — see
              ProductManagementPage.jsx's own role gating for the
              actual write-permission split. */}
          <Route path={ADMIN.products}  element={<ProductManagementPage />} />
        </Route>

        {/* The warehouse worker's dashboard. Split out of the block
            below so it can take the shell: the four flows underneath it
            are StaffShell screens and must not. */}
        <Route element={<ProtectedRoute shell />}>
          <Route path="/noc" element={<TaskDashboard />} />
        </Route>

        {/* Protected — any logged-in user */}
        <Route element={<ProtectedRoute />}>
          <Route path="/noc/decanting" element={<DecantingPage />} />
          <Route path={STAFF.decantingRecords} element={<StaffDecantingRecordsPage />} />

          {/* One URL per task, shared by managers and workers alike —
              each page picks manager view vs. staff flow by role
              internally (see ProcurementPage.jsx / PackingSelectPage.jsx
              / DecantingPage.jsx). */}
          <Route path={STAFF.receiving}       element={<ProcurementPage />} />
          <Route path={STAFF.deliveries}      element={<StaffDeliveriesPage />} />
          <Route path={PACKING.board}         element={<PackingSelectPage />} />
          <Route path={PACKING.detailPattern} element={<PackingSelectPage />} />
          <Route path={STAFF.dispatch}        element={<DispatchPage />} />
          <Route path={STAFF.dispatchHistory} element={<StaffDispatchHistoryPage />} />
          {/* Receipts lives in the manager block above — a worker who typed
              the URL would otherwise reach it, tile or no tile. */}
        </Route>

        {/* Protected — donation intake, RECEIVERS_UP only.
            Mirrors POST /api/donations in server/src/routes/donation.routes.js,
            which is auth + requireRole(WORKER, MANAGER, ADMIN). Finance can
            read the money side but does not intake stock, so it is excluded
            here exactly as it is there — the client gate is a UX courtesy,
            the server route is the actual control.

            The draft context is mounted per-route rather than around the
            block so the sessionStorage draft is scoped to the two intake
            pages and cleared by navigating away from them. */}
        <Route element={<ProtectedRoute roles={DONATION_INTAKE_ROLES} shell />}>
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

        {/* Volunteer Management — current coordinator workflow is available
            to the two live management roles only. */}
        <Route element={<ProtectedRoute roles={VOLUNTEER_MANAGEMENT_ROLES} shell />}>
          <Route path={VOLUNTEERS.events} element={<VolunteerEventsPage />} />
          <Route path={VOLUNTEERS.eventPattern} element={<VolunteerEventWorkspacePage />} />
        </Route>

        {/* Benevolent package request log (ADM-5.0 / BR-28). Warehouse
            staff and up, mirroring STAFF_UP on every
            /api/community-requests route. Log only — no stock movement. */}
        <Route element={<ProtectedRoute roles={COMMUNITY_REQUEST_ROLES} shell />}>
          <Route path={STAFF.communityRequests} element={<CommunityRequestsPage />} />
        </Route>

        {/* Guest-only */}
        <Route element={<ProtectedRoute roles={['guest']} />}>
          <Route path="/guest-home" element={<GuestHomePage />} />
        </Route>

        {/* Redirects */}
        <Route path="/inventory" element={<Navigate to="/noc/inventory" replace />} />
        <Route path="/decanting" element={<Navigate to="/noc/decanting" replace />} />
        <Route path="/programmes/noc/packing"
               element={<Navigate to={PACKING.board} replace />} />
        <Route path="/programmes/noc/packing/:slipId"
               element={<Navigate to={PACKING.board} replace />} />

        {/* Catch-all */}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
