// ─────────────────────────────────────────────────────────────
// client/src/App.jsx
//
// The routes come from routes/routeTable.js — path, who may open it,
// whether it sits in the sidebar shell — and the page each one shows
// from routes/pages.jsx. This file builds the <Routes> from the two.
//
// Guarded routes are grouped by (roles, shell): one ProtectedRoute per
// group, so moving between two manager screens keeps the same shell
// mounted rather than rebuilding the sidebar on every click.
// ─────────────────────────────────────────────────────────────
import { BrowserRouter, Routes, Route, Navigate }  from 'react-router-dom';
import { AuthProvider }                            from './context/AuthContext';
import ThemeProvider                               from './components/layout/ThemeProvider';
import ProtectedRoute                              from './components/layout/ProtectedRoute';
import { ROUTES, REDIRECTS }                       from './routes/routeTable';
import { ToastProvider }                           from './components/ui/toast';
import { PAGES }                                   from './routes/pages';
import PageNotFound                                from './pages/PageNotFound';

// Guarded routes, grouped by who may open them and whether they sit in
// the shell, in the order each group first appears in the table.
const guardGroups = () => {
  const groups = new Map();
  for (const route of ROUTES) {
    if (!route.roles) continue;
    const key = `${route.roles.join(',')}|${route.shell ? 'shell' : ''}`;
    if (!groups.has(key)) groups.set(key, { roles: route.roles, shell: Boolean(route.shell), routes: [] });
    groups.get(key).routes.push(route);
  }
  return [...groups.values()];
};

const App = () => (
  <AuthProvider>
    {/* Outside the router so the theme applies to every screen, login included. */}
    <ThemeProvider>
    <BrowserRouter>
      <ToastProvider>
      <Routes>
        {ROUTES.filter((r) => !r.roles).map((r) => (
          <Route key={r.id} path={r.path} element={PAGES[r.id]} />
        ))}

        {guardGroups().map((g) => (
          <Route key={`${g.roles.join(',')}|${g.shell}`} element={<ProtectedRoute roles={g.roles} shell={g.shell} />}>
            {g.routes.map((r) => <Route key={r.id} path={r.path} element={PAGES[r.id]} />)}
          </Route>
        ))}

        {REDIRECTS.map((r) => (
          <Route key={r.from} path={r.from} element={<Navigate to={r.to} replace />} />
        ))}

        {/* Catch-all */}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
      </ToastProvider>
    </BrowserRouter>
    </ThemeProvider>
  </AuthProvider>
);

export default App;


