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
import { useCallback, useEffect, useState } from 'react';
import { useAuth }   from '../context/AuthContext';
import { TopNavbar } from '../features/taskdashboard/components/TopNavBar';
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
import { Search, Plus, Pencil, Power, X } from 'lucide-react';

const CAN_MANAGE = ['admin'];

// Display labels only — every stored/validated/API value stays
// warehouse_worker, matching the live users.role CHECK constraint.
const ROLE_LABELS = {
  warehouse_worker: 'Worker',
  manager:           'Manager',
  admin:             'Admin',
};

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

  const [reducedMovement, setReducedMovement] = useState(false);

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list'); // list | create | edit

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
    <>
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={() => setReducedMovement((v) => !v)}
      />

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

        {isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
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

                {users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No users match.</p>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map((u) => (
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
        )}
      </main>
    </>
  );
}
