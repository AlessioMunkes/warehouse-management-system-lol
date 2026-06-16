import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SelectProgrammeScreen from './pages/SelectProgrammeScreen';
import SelectNOCjob from './pages/SelectNOCjob';
import ProcurementDashboard from './pages/ProcurementDashboard';

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>

        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected - any logged-in user */}
        <Route element={<ProtectedRoute />}>
          <Route path="/programmes"      element={<SelectProgrammeScreen />} />
          <Route path="/noc"             element={<SelectNOCjob />} />
          <Route path="/noc/procurement" element={<ProcurementDashboard />} />
        </Route>

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;