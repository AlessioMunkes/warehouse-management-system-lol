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
import UserForm      from '../features/users/components/UserForm';
import InviteForm    from '../features/users/components/InviteForm';
import InviteResultPanel from '../features/users/components/InviteResultPanel';
import PendingInvitesSection from '../features/users/components/PendingInvitesSection';
import userAPI        from '../services/userAPI';
import userInviteAPI  from '../services/userInviteAPI';
import { copyToClipboard } from '../lib/clipboard';
import { useToast } from '@/components/ui/toastContext';
import ConfirmRemoveDialog from '../features/masterdata/components/ConfirmRemoveDialog';
import useOpenFromQuery    from '../features/masterdata/hooks/useOpenFromQuery';
import useTableView        from '../features/masterdata/hooks/useTableView';
import MasterDataTable     from '../features/masterdata/components/MasterDataTable';

import { Button }    from '@/components/ui/button';
import { Skeleton }  from '@/components/ui/skeleton';
import StatusBadge   from '@/components/ui/status-badge';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs      from '@/components/ui/view-tabs';
import ListCard      from '@/components/ui/list-card';
import ListToolbar   from '@/components/ui/list-toolbar';
import DetailPanel   from '@/components/ui/detail-panel';
import EmptyState    from '@/components/ui/empty-state';
import ErrorBanner   from '@/components/ui/error-banner';
import { Plus, Pencil, Power, Trash2, Users } from 'lucide-react';

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
// Roles as tabs, client-side over the fetched rows, so they compose
// with the server-side search and "Show inactive".
const VIEWS = [
  { id: 'all',              label: 'All',      test: () => true },
  { id: 'warehouse_worker', label: 'Workers',  test: (u) => u.role === 'warehouse_worker' },
  { id: 'manager',          label: 'Managers', test: (u) => u.role === 'manager' },
  { id: 'admin',            label: 'Admins',   test: (u) => u.role === 'admin' },
];

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
    cell: (u) => (!u.isActive ? <StatusBadge kind="record" status="inactive">Inactive</StatusBadge> : null) },
];

// Same markup as the global fetch error banner in
// SupplierDirectoryPage / InventoryManagementPage. One error style
// per app.
const UserDetail = ({ targetUser, canManage, isSelf, onEdit, onToggleActive, onRemove, onClose }) => (
  <DetailPanel
    open
    onClose={onClose}
    eyebrow={targetUser.username}
    title={`${targetUser.firstName} ${targetUser.lastName}`}
    badges={isSelf || !targetUser.isActive ? <>
      {isSelf ? <StatusBadge kind="record" status="active">You</StatusBadge> : null}
      {!targetUser.isActive ? <StatusBadge kind="record" status="inactive">Inactive</StatusBadge> : null}
    </> : null}
    // Self-lockout: an admin cannot deactivate or delete their own
    // account (the server refuses both too — user.service.js). Hiding
    // the buttons avoids a confusing 400 for something nobody should be
    // able to attempt; deletion nobody could undo.
    actions={canManage ? (
      <>
        <Button type="button" variant="outline" onClick={onEdit}>
          <Pencil />
          Edit details
        </Button>
        {!isSelf ? (
          <>
            <Button type="button" variant="outline" onClick={onToggleActive}>
              <Power />
              {targetUser.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
            <Button type="button" variant="destructive" onClick={onRemove}>
              <Trash2 />
              Delete
            </Button>
          </>
        ) : null}
      </>
    ) : null}
  >
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Role</dt><dd>{ROLE_LABELS[targetUser.role] ?? targetUser.role}</dd></div>
      <div><dt className="text-muted-foreground">Status</dt><dd>{targetUser.isActive ? 'Active' : 'Inactive'}</dd></div>
    </dl>
  </DetailPanel>
);

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
  const [tab, setTab] = useState('all');
  const view = useTableView('users', COLUMNS);
  const current = VIEWS.find((v) => v.id === tab) ?? VIEWS[0];

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // ── Pending invites ────────────────────────────────────────
  // Separate from `users` on purpose — see PendingInvitesSection's
  // header comment. Not an account until accepted.
  const [pendingInvites, setPendingInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [inviteBusyId, setInviteBusyId] = useState(null);
  // The one place a raw token/url is ever held client-side, and only
  // until the admin dismisses it or leaves the page — nothing re-reads
  // it from the server afterward (there is nothing to re-read; only
  // the hash is stored).
  const [inviteResult, setInviteResult] = useState(null);
  const toast = useToast();

  // The tab narrows first, then sort orders whatever is left.
  const visibleUsers = useMemo(
    () => view.sortRows(users.filter(current.test)),
    [users, current, view],
  );
  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, users.filter(v.test).length])),
    [users],
  );

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
    userAPI.getUsers({ includeInactive, search })
      .then((rows) => {
        if (!cancelled) {
          setUsers(rows);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load users.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [includeInactive, search]);

  const open = async (id) => {
    setError(null);
    try {
      setSelected(await userAPI.getUser(id));
      setMode('list');
    } catch (err) { setError(err.message); }
  };
  // ?open=<id> from the admin Activity / Archive screens.
  useOpenFromQuery(open);

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

  // ── Invites ───────────────────────────────────────────────
  const loadInvites = useCallback(async () => {
    try {
      setPendingInvites(await userInviteAPI.getPendingInvites());
    } catch (err) {
      // A failed invite-list fetch does not block the (more important)
      // user directory — surfaces via the toast instead of the page's
      // main error banner.
      toast({ variant: 'error', title: 'Could not load pending invites', description: err.message });
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    userInviteAPI.getPendingInvites()
      .then((rows) => { if (!cancelled) setPendingInvites(rows); })
      .catch((err) => {
        if (!cancelled) toast({ variant: 'error', title: 'Could not load pending invites', description: err.message });
      })
      .finally(() => { if (!cancelled) setInvitesLoading(false); });
    return () => { cancelled = true; };
  }, [toast]);

  const createInvite = async (payload) => {
    setBusy(true); setError(null);
    try {
      const result = await userInviteAPI.createInvite(payload);
      setMode('list');
      setInviteResult(result);
      await loadInvites();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const resendInvite = async (invite) => {
    setInviteBusyId(invite.id);
    try {
      const result = await userInviteAPI.resendInvite(invite.id);
      setInviteResult(result);
      await loadInvites();
    } catch (err) {
      toast({ variant: 'error', title: 'Could not resend that invite', description: err.message });
    } finally { setInviteBusyId(null); }
  };

  // Same server call as resend — the only way to get a copyable link
  // for an existing invite, since no raw token is stored to re-read.
  // Differs from the Resend button only in what happens next: this
  // copies straight to the clipboard instead of leaving the link
  // panel open for a manual copy.
  const copyInviteLink = async (invite) => {
    setInviteBusyId(invite.id);
    try {
      const result = await userInviteAPI.resendInvite(invite.id);
      const ok = await copyToClipboard(result.url);
      setInviteResult(result);
      await loadInvites();
      toast(ok
        ? { variant: 'success', title: 'Link copied', description: `A fresh link for ${invite.email} is on your clipboard.` }
        : { variant: 'error', title: 'Could not copy automatically', description: 'The new link is shown below — copy it from there.' });
    } catch (err) {
      toast({ variant: 'error', title: 'Could not create a new link', description: err.message });
    } finally { setInviteBusyId(null); }
  };

  const revokeInvite = async (invite) => {
    setInviteBusyId(invite.id);
    try {
      await userInviteAPI.revokeInvite(invite.id);
      await loadInvites();
      toast({ variant: 'success', title: `Invite to ${invite.email} revoked` });
    } catch (err) {
      toast({ variant: 'error', title: 'Could not revoke that invite', description: err.message });
    } finally { setInviteBusyId(null); }
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
    <PageShell>
      <PageHeader
        title="User Management"
        description="Staff accounts and access. Guests sign in separately and are not managed here."
        actions={canManage ? (
          <Button type="button" onClick={() => { setSelected(null); setInviteResult(null); setMode('create'); }}>
            <Plus />
            Invite user
          </Button>
        ) : null}
      />

      <ErrorBanner className="mt-4" message={error} onRetry={loadUsers} />

      {inviteResult || canManage ? (
        <div className="mt-6 space-y-4">
          {inviteResult ? (
            <InviteResultPanel result={inviteResult} onDismiss={() => setInviteResult(null)} />
          ) : null}
          {canManage ? (
            <PendingInvitesSection
              invites={pendingInvites}
              loading={invitesLoading}
              busyId={inviteBusyId}
              onResend={resendInvite}
              onCopyLink={copyInviteLink}
              onRevoke={revokeInvite}
            />
          ) : null}
        </div>
      ) : null}

      <ViewTabs
        className="mt-6"
        label="User views"
        value={tab}
        onChange={setTab}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: isLoading ? null : counts[v.id] }))}
      />

      <div className="mt-6">
        <ListCard
          // Mounted through a reload: the search triggers the fetch, and
          // swapping it for a skeleton would lose focus after each letter.
          header={
            <ListToolbar
              search={{
                value: search,
                onChange: (value) => { setIsLoading(true); setSearch(value); },
                placeholder: 'Search by username or name',
              }}
              filters={[{
                key: 'inactive', label: 'Show inactive', active: includeInactive,
                onToggle: () => { setIsLoading(true); setIncludeInactive((v) => !v); },
              }]}
              columns={{
                idPrefix: 'users',
                columns: view.availableColumns,
                hidden: view.hidden,
                onToggle: view.toggleColumn,
                onReset: view.resetColumns,
              }}
            />
          }
        >
          {isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : visibleUsers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users match"
              description={search ? 'Nothing matches the search.' : 'Nobody is in this view.'}
              action={search ? { label: 'Clear search', onClick: () => { setIsLoading(true); setSearch(''); } } : undefined}
            />
          ) : (
            <MasterDataTable
              columns={view.visibleColumns}
              rows={visibleUsers}
              sort={view.sort}
              onToggleSort={view.toggleSort}
              onOpenRow={(u) => open(u.id)}
              noun="users"
            />
          )}
        </ListCard>
      </div>

      {mode === 'list' && selected ? (
        <UserDetail
          key={selected.id}
          targetUser={selected}
          canManage={canManage}
          isSelf={selected.id === user?.id}
          onEdit={() => setMode('edit')}
          onToggleActive={toggleActive}
          onRemove={() => setConfirmRemove(true)}
          onClose={() => setSelected(null)}
        />
      ) : null}

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

      {mode === 'create' ? (
        <DetailPanel open onClose={() => setMode('list')} title="Invite a user">
          <p className="text-sm text-muted-foreground">
            They set their own username, name and password when they accept — you never see or choose their password.
          </p>
          <InviteForm onSubmit={createInvite} onCancel={() => setMode('list')} busy={busy} />
        </DetailPanel>
      ) : null}

      {mode === 'edit' && selected ? (
        <DetailPanel open onClose={() => setMode('list')} eyebrow="Edit" title={`${selected.firstName} ${selected.lastName}`}>
          <UserForm
            initial={selected}
            isSelf={selected.id === user?.id}
            submitLabel="Save changes"
            onSubmit={save}
            onCancel={() => setMode('list')}
            busy={busy}
          />
        </DetailPanel>
      ) : null}
    </PageShell>
  );
}
