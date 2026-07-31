import React                                 from 'react';
import { BrowserRouter, Routes, Route, Navigate }  from 'react-router-dom';
import { AuthProvider }                            from './context/AuthContext';
import ProtectedRoute                              from './components/layout/ProtectedRoute';
import LoginPage                                   from './pages/LoginPage';
import SelectProgrammeScreen                       from './pages/SelectProgrammeScreen';

import GuestLoginPage                              from './pages/GuestLoginPage';
import GuestHomePage                               from './pages/GuestHomePage';
import InventoryManagementPage                     from './pages/InventoryManagementPage';
import PackingPage                                 from './pages/PackingPage';
import DecantingPage from './pages/DecantingPage';

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>

        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guest" element={<GuestLoginPage />} />
        <Route path = "/inventory" element = {<InventoryManagementPage />} />
        <Route path="/programmes/noc/packing" element={<PackingPage />} />
<Route path="/programmes/noc/packing/:slipId" element={<PackingPage />} />

        <Route path="/programmes"      element={<SelectProgrammeScreen />} />
        <Route path="/decanting"     element={<DecantingPage />} />
        {/* Protected — any logged-in user */}
        <Route element={<ProtectedRoute />}>
          
          
          
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