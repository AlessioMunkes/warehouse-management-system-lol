import { BrowserRouter, Routes, Route, Navigate }  from 'react-router-dom';
import { AuthProvider }                            from './context/AuthContext';
import ProtectedRoute                              from './components/layout/ProtectedRoute';

import LoginPage                                   from './pages/LoginPage';
import GuestLoginPage                              from './pages/GuestLoginPage';
import GuestHomePage                               from './pages/GuestHomePage';

import SelectProgrammeScreen                       from './pages/SelectProgrammeScreen';
import SelectNOCjob                                from './pages/SelectNOCjob';

import ProcurementDashboard                        from './pages/ProcurementDashboard';
import DecantingPage                               from './pages/DecantingPage';
import PackingPage                                 from './pages/PackingPage';
import InventoryManagementPage                     from './pages/InventoryManagementPage';

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>

        {/* ── Public ────────────────────────────────────────── */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guest" element={<GuestLoginPage />} />

        {/* ── Protected — any logged-in staff user ──────────── */}
        <Route element={<ProtectedRoute />}>
          <Route path="/programmes" element={<SelectProgrammeScreen />} />

          {/* NOC: task select, then one route per task */}
          <Route path="/noc"             element={<SelectNOCjob />} />
          <Route path="/noc/procurement" element={<ProcurementDashboard />} />
          <Route path="/noc/decanting"   element={<DecantingPage />} />
          <Route path="/noc/packing"     element={<PackingPage />} />
          <Route path="/noc/packing/:slipId" element={<PackingPage />} />
          <Route path="/noc/inventory"   element={<InventoryManagementPage />} />
        </Route>

        {/* ── Guest-only ────────────────────────────────────── */}
        <Route element={<ProtectedRoute roles={['guest']} />}>
          <Route path="/guest-home" element={<GuestHomePage />} />
        </Route>

        {/* ── Redirects ─────────────────────────────────────── */}
        {/* Old paths kept working so existing links don't break */}
        <Route path="/inventory" element={<Navigate to="/noc/inventory" replace />} />
        <Route path="/decanting" element={<Navigate to="/noc/decanting" replace />} />
        <Route path="/programmes/noc/packing" element={<Navigate to="/noc/packing" replace />} />

        <Route path="/" element={<Navigate to="/programmes" replace />} />

        {/* Unknown path — send to login rather than a blank screen.
            TODO: replace with a real 404 page; a silent redirect here
            makes a typo'd route look like an auth failure. */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;