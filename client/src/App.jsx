// ─────────────────────────────────────────────────────────────
// src/App.jsx
//
// The root of the app. Controls which screen is shown.
// All authentication now goes through AuthContext — no mock users here.
//
// Navigation flow:
//   login → programmes → nourish → dashboard
// ─────────────────────────────────────────────────────────────

import React, { useState }       from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage                 from './pages/LoginPage';
import SelectProgrammeScreen       from './pages/SelectProgrammeScreen';
import SelectNOCjob              from './pages/SelectNOCjob';
import ProcurementDashboard      from './pages/ProcurementDashboard';

// ── Navigation views ──────────────────────────────────────────
const VIEWS = {
  LOGIN:      'login',
  PROGRAMMES: 'programmes',
  NOURISH:    'nourish',
  DASHBOARD:  'dashboard',
};

// ── Inner app — has access to AuthContext ─────────────────────
// Separated from App so useAuth() can be called inside AuthProvider
const AppContent = () => {
  const { user, logout, isLoading } = useAuth();
  const [view, setView]             = useState(VIEWS.LOGIN);
  const [selectedTask, setSelectedTask] = useState(null);

  // While checking localStorage for an existing session, show nothing
  // (prevents a flash of the login screen for already-logged-in users)
  if (isLoading) return null;

  // ── Handlers ─────────────────────────────────────────────────

  // Called by LoginPage on successful backend login
  const handleLoginSuccess = () => {
    setView(VIEWS.PROGRAMMES);
  };

  // Called by ProgrammeSelect when NOC is chosen
  const handleProgrammeSelect = (programmeId) => {
    if (programmeId === 'noc') setView(VIEWS.NOURISH);
  };

  // Called by NourishSelect when a task is chosen
  const handleTaskSelect = (taskId) => {
    setSelectedTask(taskId);
    setView(VIEWS.DASHBOARD);
  };

  // Called by any screen's back button
  const handleBack = () => {
    if (view === VIEWS.NOURISH)    return setView(VIEWS.PROGRAMMES);
    if (view === VIEWS.DASHBOARD)  return setView(VIEWS.NOURISH);
    if (view === VIEWS.PROGRAMMES) return handleLogout();
  };

  // Clears the token, user state, and returns to login
  const handleLogout = () => {
    logout(); // from AuthContext — clears localStorage + state
    setView(VIEWS.LOGIN);
    setSelectedTask(null);
  };

  // ── Render ───────────────────────────────────────────────────

  if (view === VIEWS.LOGIN) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (view === VIEWS.PROGRAMMES) {
    return (
      <SelectProgrammeScreen
        userName={user?.firstName}
        userRole={user?.role}
        onSelect={handleProgrammeSelect}
        onLogout={handleLogout}
      />
    );
  }

  if (view === VIEWS.NOURISH) {
    return (
      <SelectNOCjob
        userName={user?.firstName}
        userRole={user?.role}
        onSelect={handleTaskSelect}
        onBack={handleBack}
        onLogout={handleLogout}
      />
    );
  }

  if (view === VIEWS.DASHBOARD) {
    return (
      <ProcurementDashboard
        userName={user?.firstName}
        userLastName={user?.lastName}
        userRole={user?.role}
        userId={user?.id}          // ← now available for API calls that need the user's id
        selectedTask={selectedTask}
        onBack={handleBack}
        onLogout={handleLogout}
      />
    );
  }

  return null;
};

// ── Root App — wraps everything in AuthProvider ───────────────
const App = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
