import { BrowserRouter, Routes, Route, Navigate }  from 'react-router-dom';
import { AuthProvider }                            from './context/AuthContext';
import ProtectedRoute                              from './components/layout/ProtectedRoute';
import { PACKING }                                 from './routes/paths';
import LandingPage                                 from './pages/LandingPage';
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
        {/* Public */}
        <Route path="/"      element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guest" element={<GuestLoginPage />} />
        <Route path="/noc/procurement" element={<ProcurementDashboard />} />
        
        {/* Protected — any logged-in user */}
        <Route element={<ProtectedRoute />}>
          <Route path="/programmes" element={<SelectProgrammeScreen />} />

          {/* NOC: task select, then one route per task */}
          <Route path="/noc"             element={<SelectNOCjob />} />
          
          <Route path="/noc/decanting"   element={<DecantingPage />} />

          {/* Both packing paths come from routes/paths.js, which is
              also what PackingPage navigates with — the board and the
              route table can't drift apart again. */}
          <Route path={PACKING.board}         element={<PackingPage />} />
          <Route path={PACKING.detailPattern} element={<PackingPage />} />

          <Route path="/noc/inventory"   element={<InventoryManagementPage />} />
        </Route>

        {/* ── Guest-only ────────────────────────────────────── */}
        <Route element={<ProtectedRoute roles={['guest']} />}>
          <Route path="/guest-home" element={<GuestHomePage />} />
        </Route>

        {/* ── Redirects ─────────────────────────────────────── */}
        {/* Old paths kept working so existing links don't break.
            The packing pair covers the deep link too — without
            :slipId, an old bookmark to a specific pallet would hit
            the catch-all instead of the slip. */}
        <Route path="/inventory" element={<Navigate to="/noc/inventory" replace />} />
        <Route path="/decanting" element={<Navigate to="/noc/decanting" replace />} />
        <Route path="/programmes/noc/packing"
               element={<Navigate to={PACKING.board} replace />} />
        <Route path="/programmes/noc/packing/:slipId"
               element={<Navigate to={PACKING.board} replace />} />

        {/* Catch-all. There used to be two of these plus a second "/"
            route; React Router picks one by ranking, so the others
            were dead code that read as if they did something.
            Unknown paths go to the landing page, which is the front
            door for staff, volunteers and visitors alike (warehouse
            visit §6.1) and carries the login button — sending them to
            /login instead made a typo'd URL look like a session error.
            TODO: replace with a real 404 page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;