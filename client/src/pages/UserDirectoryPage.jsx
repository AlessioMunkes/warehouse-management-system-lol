// ─────────────────────────────────────────────────────────────
// client/src/pages/UserDirectoryPage.jsx
//
// Admin-only. App.jsx gates the route and every endpoint in
// user.routes.js is requireRole(ADMIN) — the useAuth check below is
// belt-and-braces for the same reason SupplierDirectoryPage does it:
// the route decides who reaches the page, the role check decides what
// the page offers them. Stricter than suppliers' manager+admin gate,
// because this is account provisioning, not a stock directory.
//
// GUEST IS NOT HERE ON PURPOSE.
// Guests are volunteers, not users — no username, no password, no
// is_active in this sense (see session.route.js). This screen only
// ever lists worker / manager / admin, the three values users.role
// actually accepts.
//
// The error banner, loading skeleton and the `cancelled`-flag guard in
// the load effect are copied from SupplierDirectoryPage.jsx — one
// error style, one loading style, one stale-response guard per app.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth }   from '../context/AuthContext';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import UserForm      from '../features/users/components/UserForm';
import userAPI        from '../services/userAPI';

import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from '@/components/ui/input-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Checkbox }  from '@/components/ui/checkbox';
import { Skeleton }  from '@/components/ui/skeleton';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Search, Plus, Pencil, Power, X,
  ArrowUp, ArrowDown, ChevronsUpDown,
} from 'lucide-react';

const CAN_MANAGE = ['admin'];

// Display labels only — every stored/validated/API value stays
// warehouse_worker, matching the live users.role CHECK constraint.
const ROLE_LABELS = {
  warehouse_worker: 'Worker',
  manager:           'Manager',
  admin:             'Admin',
};

// The three values users.role actually accepts — the live CHECK
// constraint, not a wish list. Drives the role-filter pills; each pill
// filters on the raw value and shows ROLE_LABELS[value].
const ROLE_FILTERS = ['warehouse_worker', 'manager', 'admin'];

// One definition drives the header and the sort accessor, the same
// shape StockManifestTable uses. Every user column sorts as text, so
// each `sort` returns a lowercased string and the comparator is a
// single localeCompare. The status column has no accessor: "active vs
// inactive" is not an order anyone asked to sort by, and the server
// already groups inactive users last.
const COLUMNS = [
  { key: 'name',     label: 'User',
    sort: (u) => `${u.firstName} ${u.lastName}`.trim().toLowerCase() },
  { key: 'username', label: 'Username',
    sort: (u) => (u.username ?? '').toLowerCase() },
  // Sort by the label the user reads ("Worker"), not the raw enum
  // ("warehouse_worker") — otherwise the on-screen order looks wrong.
  { key: 'role',     label: 'Role',
    sort: (u) => (ROLE_LABELS[u.role] ?? u.role ?? '').toLowerCase() },
  { key: 'status',   label: '', sort: null },
];

// Same markup as the global fetch error banner in
// SupplierDirectoryPage / InventoryManagementPage. One error style
// per app.
const ErrorBanner = ({ message, onRetry }) => (
  <div className="p-4 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
    <span>{message}</span>
    {onRetry ? (
      <button
        onClick={onRetry}
        className="text-xs sm:text-sm font-semibold underline hover:text-[#ef3a40] focus:outline-none"
      >
        Try again
      </button>
    ) : null}
  </div>
);

// ── Detail panel ──────────────────────────────────────────────
const UserDetail = ({ targetUser, canManage, isSelf, onEdit, onToggleActive, onClose }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle className="flex items-center gap-2">
          {targetUser.firstName} {targetUser.lastName}
          {isSelf ? <Badge variant="outline">You</Badge> : null}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{targetUser.username}</p>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
        <X />
      </Button>
    </CardHeader>

    <CardContent className="space-y-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Role</dt><dd>{ROLE_LABELS[targetUser.role] ?? targetUser.role}</dd></div>
        <div><dt className="text-muted-foreground">Status</dt><dd>{targetUser.isActive ? 'Active' : 'Inactive'}</dd></div>
      </dl>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil />
            Edit details
          </Button>
          {/* Self-lockout: an admin cannot deactivate their own
              account (server enforces this too — see
              user.service.js). Hiding the button here avoids a
              confusing 400 for something nobody should be able to
              attempt in the first place. */}
          {!isSelf ? (
            <Button type="button" variant="outline" onClick={onToggleActive}>
              <Power />
              {targetUser.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </CardContent>
  </Card>
);

// ── Page ──────────────────────────────────────────────────────
export default function UserDirectoryPage() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE.includes(user?.role);

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list'); // list | create | edit

  // Client-side view controls. Both operate on the already-fetched
  // list — no server round-trip — so they compose with search and the
  // "Show inactive" toggle (which are server-side) for free.
  const [roleFilter, setRoleFilter] = useState(null);   // null = all roles
  const [sort, setSort] = useState(null);               // { key, direction } | null

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // 3-state, same as StockManifestTable: first click sorts desc,
  // second asc, third clears back to the server's order (is_active
  // DESC, then username ASC — see user.repository.js).
  const toggleSort = (key) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'desc' };
      if (prev.direction === 'desc') return { key, direction: 'asc' };
      return null;
    });
  };

  // Role filter narrows first, then sort orders whatever is left — the
  // two compose, they do not fight over the array.
  const visibleUsers = useMemo(() => {
    const filtered = roleFilter
      ? users.filter((u) => u.role === roleFilter)
      : users;

    if (!sort) return filtered;
    const column = COLUMNS.find((c) => c.key === sort.key);
    if (!column?.sort) return filtered;

    const factor = sort.direction === 'desc' ? -1 : 1;
    return [...filtered].sort(
      (a, b) => column.sort(a).localeCompare(column.sort(b), 'en-ZA') * factor
    );
  }, [users, roleFilter, sort]);

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      setUsers(await userAPI.getUsers({ includeInactive, search }));
    } catch (err) {
      setError(err.message || 'Could not load users.');
    }
  }, [includeInactive, search]);

  // The cancelled flag is the same guard SupplierDirectoryPage uses: a
  // fast filter change would otherwise let a stale response overwrite
  // fresher state.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadUsers().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [loadUsers]);

  const open = async (id) => {
    setError(null);
    try {
      setSelected(await userAPI.getUser(id));
      setMode('list');
    } catch (err) { setError(err.message); }
  };

  const create = async (payload) => {
    setBusy(true); setError(null);
    try {
      const created = await userAPI.createUser(payload);
      setMode('list');
      await loadUsers();
      await open(created.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const save = async (payload) => {
    setBusy(true); setError(null);
    try {
      await userAPI.updateUser(selected.id, payload);
      setMode('list');
      await loadUsers();
      await open(selected.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const toggleActive = async () => {
    setError(null);
    try {
      await userAPI.setUserStatus(selected.id, !selected.isActive);
      await loadUsers();
      await open(selected.id);
    } catch (err) { setError(err.message); }
  };

  return (
    <ManagerLayout>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Staff accounts and access. Guests sign in separately and are not managed here.
        </p>

        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} onRetry={loadUsers} />
          </div>
        ) : null}

        <div className="mt-6 space-y-6">
          {mode === 'create' ? (
            <Card>
              <CardHeader><CardTitle>Create a user</CardTitle></CardHeader>
              <CardContent>
                <UserForm onSubmit={create} onCancel={() => setMode('list')} busy={busy} />
              </CardContent>
            </Card>
          ) : mode === 'edit' && selected ? (
            <Card>
              <CardHeader><CardTitle>Edit {selected.firstName} {selected.lastName}</CardTitle></CardHeader>
              <CardContent>
                <UserForm
                  initial={selected}
                  isSelf={selected.id === user?.id}
                  submitLabel="Save changes"
                  onSubmit={save}
                  onCancel={() => setMode('list')}
                  busy={busy}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* This toolbar is deliberately OUTSIDE the isLoading
                  check below. Gating the whole block on isLoading swaps
                  this search input for a Skeleton and back on every
                  reload — and reload fires on every keystroke, since
                  loadUsers depends on `search`. Swapping the element
                  out destroys its DOM node mid-type, which is what was
                  stealing focus after each letter. Only the results
                  area below (table / empty state) needs to reflect a
                  fetch in flight; the controls that trigger a fetch
                  must stay mounted through it. */}
              <div className="flex flex-wrap items-center gap-3">
                <InputGroup className="min-w-56 flex-1">
                  <InputGroupAddon align="inline-start">
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput
                    placeholder="Search by username or name"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </InputGroup>

                <Field orientation="horizontal" className="w-auto">
                  <Checkbox
                    id="include-inactive"
                    checked={includeInactive}
                    onCheckedChange={(v) => setIncludeInactive(Boolean(v))}
                  />
                  <FieldLabel htmlFor="include-inactive" className="font-normal">
                    Show inactive
                  </FieldLabel>
                </Field>

                {/* Role filter. No pill selected = all roles. Clicking
                    the active pill clears it. Filters the raw enum,
                    shows the label — same split as everywhere else on
                    this page. */}
                <div className="flex items-center gap-1">
                  {ROLE_FILTERS.map((role) => {
                    const active = roleFilter === role;
                    return (
                      <Button
                        key={role}
                        type="button"
                        size="sm"
                        variant={active ? 'default' : 'outline'}
                        aria-pressed={active}
                        onClick={() => setRoleFilter(active ? null : role)}
                      >
                        {ROLE_LABELS[role]}
                      </Button>
                    );
                  })}
                </div>

                {canManage ? (
                  <Button type="button" onClick={() => { setSelected(null); setMode('create'); }}>
                    <Plus />
                    Create user
                  </Button>
                ) : null}
              </div>

              {selected ? (
                <UserDetail
                  targetUser={selected}
                  canManage={canManage}
                  isSelf={selected.id === user?.id}
                  onEdit={() => setMode('edit')}
                  onToggleActive={toggleActive}
                  onClose={() => setSelected(null)}
                />
              ) : null}

              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : visibleUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users match.</p>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {COLUMNS.map((col) => (
                            <TableHead key={col.key}>
                              {col.sort ? (
                                <button
                                  type="button"
                                  onClick={() => toggleSort(col.key)}
                                  aria-label={`Sort by ${col.label}`}
                                  className="inline-flex items-center gap-1 hover:text-foreground"
                                >
                                  <span>{col.label}</span>
                                  {sort?.key === col.key
                                    ? (sort.direction === 'desc'
                                        ? <ArrowDown className="h-3 w-3" />
                                        : <ArrowUp className="h-3 w-3" />)
                                    : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
                                </button>
                              ) : col.label}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleUsers.map((u) => (
                          <TableRow
                            key={u.id}
                            className="cursor-pointer"
                            onClick={() => open(u.id)}
                          >
                            <TableCell className="font-medium">{u.firstName} {u.lastName}</TableCell>
                            <TableCell className="text-muted-foreground">{u.username}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {ROLE_LABELS[u.role] ?? u.role}
                            </TableCell>
                            <TableCell>
                              {!u.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </ManagerLayout>
  );
}
