import React                                 from 'react';
import { BrowserRouter, Routes, Route, Navigate }  from 'react-router-dom';
import { AuthProvider }                            from './context/AuthContext';
import ProtectedRoute                              from './components/layout/ProtectedRoute';
import LoginPage                                   from './pages/LoginPage';
import SelectProgrammeScreen                       from './pages/SelectProgrammeScreen';
import SelectNOCjob                                from './pages/SelectNOCjob';
import ProcurementDashboard                        from './pages/ProcurementDashboard';
import GuestLoginPage                              from './pages/GuestLoginPage';
import GuestHomePage                               from './pages/GuestHomePage';
import PackingPage                                 from './pages/PackingPage';
const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>

        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guest" element={<GuestLoginPage />} />
        <Route path="/packing" element={<PackingPage />} />

        {/* Protected — any logged-in user */}
        <Route element={<ProtectedRoute />}>
          <Route path="/programmes"      element={<SelectProgrammeScreen />} />
          <Route path="/noc"             element={<SelectNOCjob />} />
          <Route path="/noc/procurement" element={<ProcurementDashboard />} />
        </Route>

        {/* Guest-only */}
        <Route element={<ProtectedRoute roles={['guest']} />}>
          <Route path="/guest-home" element={<GuestHomePage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;