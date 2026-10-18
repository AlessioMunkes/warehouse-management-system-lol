// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/routeRoles.js
//
// Who may call every route, read off the routers themselves.
//
// requireRole tags the guard it returns with `.roles`
// (middleware/auth.middleware.js), so walking a router's stack gives,
// for each method + path, the roles its guards allow — or 'no role
// check' when no requireRole guards it (it may still need a login).
// Router-level guards (router.use(requireRole …)) apply to every route
// declared after them, as they do in Express.
//
// Callers must vi.mock('../src/config/db.js') first: importing a route
// file pulls in its controller, service and repository, and db.js
// opens a connection on import.
// ─────────────────────────────────────────────────────────────
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROUTES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'routes');

const rolesOf = (handlers) => {
  const guards = handlers.filter((h) => Array.isArray(h?.roles));
  if (guards.length === 0) return null;
  // Every guard on the way must pass, so the allowed set is the
  // intersection.
  return guards
    .map((g) => [...g.roles])
    .reduce((acc, roles) => acc.filter((r) => roles.includes(r)));
};

export const routeRoleTable = async () => {
  const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js')).sort();
  const table = {};

  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(ROUTES_DIR, file)).href);
    const router = mod.default;
    if (!router?.stack) continue;

    const routerGuards = [];
    for (const layer of router.stack) {
      if (!layer.route) {
        if (Array.isArray(layer.handle?.roles)) routerGuards.push(layer.handle);
        continue;
      }
      const handlers = [...routerGuards, ...layer.route.stack.map((l) => l.handle)];
      const roles = rolesOf(handlers);
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]).sort();
      for (const method of methods) {
        const key = `${file} ${method.toUpperCase()} ${layer.route.path}`;
        table[key] = roles ? [...new Set(roles)].sort().join(',') : 'no role check';
      }
    }
  }
  return table;
};
