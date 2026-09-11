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
import ConfirmRemoveDialog from '../features/masterdata/components/ConfirmRemoveDialog';
import useDetailFocus      from '../features/masterdata/hooks/useDetailFocus';
import useTableView        from '../features/masterdata/hooks/useTableView';
import MasterDataTable     from '../features/masterdata/components/MasterDataTable';
import ColumnToggle        from '../features/masterdata/components/ColumnToggle';
import FilterPills         from '../features/masterdata/components/FilterPills';

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
import { Search, Plus, Pencil, Power, X, Trash2 } from 'lucide-react';

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
  // alwaysOn: the name is what identifies the row, so it is not
  // something the column toggle may switch off.
  { key: 'name',     label: 'User', alwaysOn: true, weight: 3,
    sort: (u) => `${u.firstName} ${u.lastName}`.trim().toLowerCase(),
    cellClass: 'font-medium',
    cell: (u) => `${u.firstName} ${u.lastName}` },
  { key: 'username', label: 'Username', weight: 2.2, minWidth: 'sm',
    sort: (u) => (u.username ?? '').toLowerCase(),
    cell: (u) => u.username },
  // Sort by the label the user reads ("Worker"), not the raw enum
  // ("warehouse_worker") — otherwise the on-screen order looks wrong.
  { key: 'role',     label: 'Role', weight: 1.6, minWidth: 'md',
    sort: (u) => (ROLE_LABELS[u.role] ?? u.role ?? '').toLowerCase(),
    cell: (u) => ROLE_LABELS[u.role] ?? u.role },
  { key: 'status',   label: '', sort: null, alwaysOn: true, weight: 1.8,
    cell: (u) => (!u.isActive ? <Badge variant="outline">Inactive</Badge> : null) },
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
const UserDetail = ({ targetUser, canManage, isSelf, onEdit, onToggleActive, onRemove, onClose }) => (
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
          {/* Self-lockout applies to deletion too, and harder: nobody
              can undo it, including the admin who just did it. The
              server refuses it as well (user.service.js). */}
          {!isSelf ? (
            <>
              <Button type="button" variant="outline" onClick={onToggleActive}>
                <Power />
                {targetUser.isActive ? 'Deactivate' : 'Reactivate'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onRemove}
                className="border-[#ef3a40] text-[#ef3a40] hover:bg-[#ef3a40] hover:text-white"
              >
                <Trash2 />
                Delete
              </Button>
            </>
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
  const view = useTableView('users', COLUMNS);

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [detailRef, focusDetail] = useDetailFocus();

  // Role filter narrows first, then sort orders whatever is left — the
  // two compose, they do not fight over the array.
  const visibleUsers = useMemo(() => {
    const filtered = roleFilter
      ? users.filter((u) => u.role === roleFilter)
      : users;
    return view.sortRows(filtered);
  }, [users, roleFilter, view]);

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
      focusDetail();
    } catch (err) { setError(err.message); }
  };

  const deactivateFromDialog = async () => {
    setBusy(true);
    try {
      await userAPI.setUserStatus(selected.id, false);
      setConfirmRemove(false);
      await loadUsers();
      await open(selected.id);
    } catch (err) { setError(err.message); setConfirmRemove(false); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await userAPI.deleteUser(selected.id);
      setConfirmRemove(false);
      setSelected(null);
      await loadUsers();
    } catch (err) { setError(err.message); setConfirmRemove(false); }
    finally { setBusy(false); }
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
        <h1 className="text-2xl font-medium">User Management</h1>
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
                <FilterPills
                  label="Filter by role"
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={ROLE_FILTERS.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                />

                <ColumnToggle
                  idPrefix="users"
                  columns={view.availableColumns}
                  hidden={view.hidden}
                  onToggle={view.toggleColumn}
                  onReset={view.resetColumns}
                />

                {canManage ? (
                  <Button type="button" onClick={() => { setSelected(null); setMode('create'); }}>
                    <Plus />
                    Create user
                  </Button>
                ) : null}
              </div>

              <div ref={detailRef} tabIndex={-1} className="scroll-mt-6 outline-none">
                {selected ? (
                  <UserDetail
                    targetUser={selected}
                    canManage={canManage}
                    isSelf={selected.id === user?.id}
                    onEdit={() => setMode('edit')}
                    onToggleActive={toggleActive}
                    onRemove={() => setConfirmRemove(true)}
                    onClose={() => setSelected(null)}
                  />
                ) : null}
              </div>

              {selected ? (
                <ConfirmRemoveDialog
                  open={confirmRemove}
                  onOpenChange={setConfirmRemove}
                  name={`${selected.firstName} ${selected.lastName}`.trim() || selected.username}
                  noun="account"
                  isActive={selected.isActive}
                  busy={busy}
                  historyNote="Everything they did stays on the record under their name."
                  onDeactivate={deactivateFromDialog}
                  onDelete={remove}
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
                    <MasterDataTable
                      columns={view.visibleColumns}
                      rows={visibleUsers}
                      sort={view.sort}
                      onToggleSort={view.toggleSort}
                      onOpenRow={(u) => open(u.id)}
                    />
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
