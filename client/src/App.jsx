import { BrowserRouter, Routes, Route, Navigate }  from 'react-router-dom';
import { AuthProvider }                            from './context/AuthContext';
import ProtectedRoute                              from './components/layout/ProtectedRoute';
import { PACKING, STAFF, DONATIONS, DONATION_INTAKE_ROLES, ADMIN } from './routes/paths';
import LandingPage                                 from './pages/LandingPage';
import LoginPage                                   from './pages/LoginPage';
import GuestLoginPage                              from './pages/GuestLoginPage';
import GuestHomePage                               from './pages/GuestHomePage';
import PageNotFound                               from "./pages/PageNotFound";
//import SelectNOCjob                                from './pages/SelectNOCjob';

import ProcurementPage                             from './pages/ProcurementPage';
import DecantingPage                               from './pages/DecantingPage';
import PackingSelectPage                           from './pages/PackingSelectPage';
import DispatchPage                                from './pages/DispatchPage';
import InventoryManagementPage                     from './pages/InventoryManagementPage';
import ManagerActivityScreen                       from './pages/ManagerActivityScreen';
import TaskDashboard from './pages/TaskDashboardPage';
import SupplierDirectoryPage                       from './pages/SupplierDirectoryPage';
import PurchaseOrdersPage                          from './pages/PurchaseOrdersPage';
import ReportingPage                               from './pages/ReportingPage';
import AdminActivityScreen                         from './pages/AdminActivityScreen';

// Donations — new feature, own draft context scoped to just these
// two routes (see features/donation/context/DonationDraftProvider.jsx)
import { DonationDraftProvider }                   from './features/donation/context/DonationDraftProvider';
import { DonationDetailsPage }                     from './pages/DonationDetailsPage';
import { ReviewPage as DonationReviewPage }         from './pages/ReviewPage';

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/"      element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guest" element={<GuestLoginPage />} />
         
        
        {/* ── Admin only ─────────────────────────────────── */}
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path={ADMIN.dashboard} element={<AdminActivityScreen />} />
          <Route path={ADMIN.suppliers} element={<SupplierDirectoryPage />} />
        </Route>

        {/* Protected — manager only */}
        <Route element={<ProtectedRoute roles={['manager']} />}>
          <Route path="/manager"       element={<ManagerActivityScreen />} />
        <Route path="/noc/inventory" element={<InventoryManagementPage />} />
          <Route path={STAFF.reporting} element={<ReportingPage />} />
          <Route path={STAFF.purchaseOrders} element={<PurchaseOrdersPage />} />
        </Route>

        {/* Protected — any logged-in user */}
        <Route element={<ProtectedRoute />}>
          {/* NOC task select — the placeholder dashboard until the
              real one lands. */}
          <Route path="/noc"           element={<TaskDashboard />} />
          <Route path="/noc/decanting" element={<DecantingPage />} />

          {/* One URL per task, shared by managers and workers alike —
              each page picks manager view vs. staff flow by role
              internally (see ProcurementPage.jsx / PackingSelectPage.jsx
              / DecantingPage.jsx). */}
          <Route path={STAFF.receiving}       element={<ProcurementPage />} />
          <Route path={PACKING.board}         element={<PackingSelectPage />} />
          <Route path={PACKING.detailPattern} element={<PackingSelectPage />} />
          <Route path={STAFF.dispatch}        element={<DispatchPage />} />
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
