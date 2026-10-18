// ─────────────────────────────────────────────────────────────
// src/features/feedTheSoil/FeedTheSoilPanels.jsx
//
// The side panels on the Feed the Soil manager page: assigning a kit,
// logging compost, dispatching, picking a kit to log against, and the
// kit and record details. Each shows what it is given and reports back
// through its callbacks; the data and saving stay in
// FeedTheSoilManagerView.jsx.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import formatKitCode from './kitCode';
import { todayISO } from '../packing/spareSlips';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search } from 'lucide-react';
import { STATUS_LABELS, fmtKg } from './feedTheSoilLists';
import { formatShortDate as fmtDate, formatShortDateTime as fmtDateTime } from '@/lib/dates';

export const KitStatus = ({ status }) => (
  <StatusBadge kind="kit" status={status}>{STATUS_LABELS[status] ?? status}</StatusBadge>
);

// ── Assign-a-kit panel ─────────────────────────────────────────
export const AssignKitPanel = ({ busy, error, onSubmit, onCancel }) => {
  const [ownerName, setOwnerName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [assignedAt, setAssignedAt] = useState(todayISO());
  const [touched, setTouched] = useState(false);
  const ownerMissing = !ownerName.trim();

  const submit = () => {
    setTouched(true);
    if (ownerMissing) return;
    onSubmit({ ownerName: ownerName.trim(), suburb: suburb.trim(), assignedAt });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Assign a kit</CardTitle></CardHeader>
      <CardContent>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}

          <Field data-invalid={(touched && ownerMissing) || undefined}>
            <FieldLabel htmlFor="fts-owner">Owner's name</FieldLabel>
            <Input
              id="fts-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
              onBlur={() => setTouched(true)} placeholder="Jane M."
              aria-invalid={(touched && ownerMissing) || undefined}
            />
            {touched && ownerMissing ? <FieldError>An owner name is required.</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="fts-suburb">Suburb</FieldLabel>
            <Input id="fts-suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Delft" />
            <FieldDescription>No street address or contact details are kept.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="fts-assigned">Date assigned</FieldLabel>
            <Input id="fts-assigned" type="date" value={assignedAt} onChange={(e) => setAssignedAt(e.target.value)} />
          </Field>

          <Field orientation="horizontal">
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Assigning' : 'Assign kit'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

// ── Log-compost panel ────────────────────────────────────────
export const LogCompostPanel = ({ kit, busy, error, onSubmit, onCancel }) => {
  const [kg, setKg] = useState('');
  const [loggedAt, setLoggedAt] = useState(todayISO());
  const [touched, setTouched] = useState(false);
  const kgInvalid = kg === '' || Number.isNaN(Number(kg)) || Number(kg) < 0;

  const submit = () => {
    setTouched(true);
    if (kgInvalid) return;
    onSubmit({ kgCompost: Number(kg), loggedAt });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Log compost · {kit.owner_name}</CardTitle></CardHeader>
      <CardContent>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}

          <Field data-invalid={(touched && kgInvalid) || undefined}>
            <FieldLabel htmlFor="fts-kg">Kilograms of compost collected</FieldLabel>
            <Input
              id="fts-kg" type="number" min="0" step="0.1" value={kg}
              onChange={(e) => setKg(e.target.value)} onBlur={() => setTouched(true)}
              aria-invalid={(touched && kgInvalid) || undefined}
            />
            {touched && kgInvalid ? <FieldError>Enter a kilogram amount of 0 or more.</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="fts-logged">Date collected</FieldLabel>
            <Input id="fts-logged" type="date" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} />
          </Field>

          <Field orientation="horizontal">
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Logging' : 'Log compost'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

// ── Dispatch panel ───────────────────────────────────────────
// A record needs a destination to count as dispatched — see
// collectionKit.service.js's markDispatched. A one-tap action can't
// capture that, so this is its own small step like Assign/Log.
export const DispatchPanel = ({ record, busy, error, onSubmit, onCancel }) => {
  const [dispatchedTo, setDispatchedTo] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = !dispatchedTo.trim();

  const submit = () => {
    setTouched(true);
    if (missing) return;
    onSubmit(dispatchedTo.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mark dispatched · {formatKitCode(record.kit_id)}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}

          <p className="text-sm text-muted-foreground">
            {fmtKg(record.kg_compost)} collected {fmtDate(record.logged_at)}
          </p>

          <Field data-invalid={(touched && missing) || undefined}>
            <FieldLabel htmlFor="fts-dispatch-to">Farmer or drop-off point</FieldLabel>
            <Input
              id="fts-dispatch-to" value={dispatchedTo} onChange={(e) => setDispatchedTo(e.target.value)}
              onBlur={() => setTouched(true)} placeholder="e.g. Voorbrug Farm"
              aria-invalid={(touched && missing) || undefined}
            />
            {touched && missing ? <FieldError>Where this compost went is required.</FieldError> : null}
          </Field>

          <Field orientation="horizontal">
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Marking dispatched' : 'Mark dispatched'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

// ── Pick a kit to log against — reached from the Records tab,
// where no kit is known yet. Reuses the Kits tab's own list.
export const LogPickKitPanel = ({ kits, isLoading, search, onSearch, onPick, onCancel }) => (
  <Card>
    <CardHeader><CardTitle>Log a collection</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8" placeholder="Search by owner or suburb"
          value={search} onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : kits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No kits match.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kit</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Suburb</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kits.map((k) => (
              <TableRow key={k.id} className="cursor-pointer" onClick={() => onPick(k)}>
                <TableCell className="font-medium">{formatKitCode(k.id)}</TableCell>
                <TableCell>{k.owner_name}</TableCell>
                <TableCell className="text-muted-foreground">{k.suburb || '-'}</TableCell>
                <TableCell><KitStatus status={k.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </CardContent>
  </Card>
);

// ── Kit detail ────────────────────────────────────────────────
export const KitDetail = ({ kit, onLogCompost, onOpenRecord, onClose }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>Collection kit details</CardTitle>
        <p className="text-sm text-muted-foreground">
          {formatKitCode(kit.id)} · {kit.owner_name} · {kit.suburb || 'No suburb on record'} · assigned {fmtDate(kit.assigned_at)}
        </p>
      </div>
      <KitStatus status={kit.status} />
    </CardHeader>
    <CardContent className="space-y-4">
      <Button type="button" size="sm" onClick={() => onLogCompost(kit)}>Log compost</Button>

      {kit.records.length === 0 ? (
        <p className="text-sm text-muted-foreground">No compost logged for this kit yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kit.records.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpenRecord(r.id)}>
                <TableCell>{fmtDate(r.logged_at)}</TableCell>
                <TableCell><KitStatus status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button type="button" variant="ghost" size="sm" onClick={onClose}>Back to kits</Button>
    </CardContent>
  </Card>
);

// ── Record detail ─────────────────────────────────────────────
// What a record row opens into, whichever tab it was clicked from — a
// record's own date, weight, status and (once dispatched) destination,
// with the kit it belongs to shown as a reference, not the subject.
export const RecordDetail = ({ record, onDispatch, onOpenKit, onClose, backLabel }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>Compost record details</CardTitle>
        <p className="text-sm text-muted-foreground">
          {formatKitCode(record.kit_id)} · {record.owner_name}{record.suburb ? ` · ${record.suburb}` : ''}
        </p>
      </div>
      <KitStatus status={record.status} />
    </CardHeader>
    <CardContent className="space-y-4">
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="text-muted-foreground">Date collected</TableCell>
            <TableCell>{fmtDate(record.logged_at)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-muted-foreground">Weight</TableCell>
            <TableCell>{fmtKg(record.kg_compost)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-muted-foreground">Notes</TableCell>
            <TableCell>{record.notes || '-'}</TableCell>
          </TableRow>
          {record.status === 'dispatched' ? (
            <>
              <TableRow>
                <TableCell className="text-muted-foreground">Dispatched</TableCell>
                <TableCell>{fmtDateTime(record.dispatched_at)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Sent to</TableCell>
                <TableCell>{record.dispatched_to || '-'}</TableCell>
              </TableRow>
            </>
          ) : null}
        </TableBody>
      </Table>

      <div className="flex flex-wrap gap-2">
        {record.status === 'logged' ? (
          <Button type="button" size="sm" onClick={() => onDispatch(record)}>Mark dispatched</Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenKit(record.kit_id)}>
          View kit logs
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>{backLabel}</Button>
      </div>
    </CardContent>
  </Card>
);
