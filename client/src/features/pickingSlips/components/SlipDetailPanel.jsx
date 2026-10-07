// ─────────────────────────────────────────────────────────────
// client/src/features/pickingSlips/components/SlipDetailPanel.jsx
//
// One pallet, opened from its row: where it is, who has it, what is on
// it, and the handful of things a manager can do about it.
//
// WHO PACKS IT
// Workers claim slips themselves; a slip on the floor ('pending') is
// anyone's. A manager can also hand a slip to a named worker — on the
// floor or already claimed — or send a claimed one back to the floor (a
// shift ends, someone goes home sick, the wrong pallet got tapped). The
// server allows a manager to reassign (picking.service.js assignSlip,
// canOverride for managers); a worker can only claim for themselves.
//
// A second packer only means something once a first one holds the slip
// (picking.repository.js addSecondPacker), so that control appears only
// then. A packed, dispatched or cancelled slip is read-only here: this
// screen organises the queue, it does not pull finished work apart.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Pencil, Printer, Undo2, UserPlus, UserRoundCheck } from 'lucide-react';
import DetailPanel from '@/components/ui/detail-panel';
import StatusBadge from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { fmtQty } from '../../../lib/quantity';
import {
  SLIP_STATE_LABEL, canAssign, canRelease, dayLabel, packers, slipState,
} from '../slipViews';

const ITEM_STATUS = { pending: 'To pack', confirmed: 'Packed', flagged: 'Flagged' };

const Section = ({ title, children }) => (
  <section>
    <h3 className="mb-2 text-sm font-medium">{title}</h3>
    {children}
  </section>
);

const Fact = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="break-words text-sm tabular-nums">{value}</dd>
  </div>
);

const WorkerSelect = ({ id, label, workers, exclude = [], value, onChange }) => (
  <Select value={value || undefined} onValueChange={onChange}>
    <SelectTrigger id={id} className="w-52" aria-label={label}><SelectValue placeholder="Choose a worker" /></SelectTrigger>
    <SelectContent>
      {workers.filter((w) => !exclude.includes(w.id)).map((w) => (
        <SelectItem key={w.id} value={String(w.id)}>{w.first_name} {w.last_name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export default function SlipDetailPanel({
  slip, workers = [], busy = false,
  onAssign, onRelease, onAddSecond, onEdit, onPrintLabel, onClose,
}) {
  const [assignTo, setAssignTo] = useState('');
  const [secondTo, setSecondTo] = useState('');

  const state = slipState(slip);
  const items = slip.items ?? [];
  const confirmed = slip.confirmed_items ?? items.filter((i) => i.status === 'confirmed').length;
  const total = slip.total_items ?? items.length;
  const flagged = items.filter((i) => i.status === 'flagged').length;
  const day = slip.dispatch_date_iso ?? String(slip.dispatch_date ?? '').slice(0, 10);

  return (
    <DetailPanel
      open
      onClose={onClose}
      eyebrow={`${dayLabel(day)} · ${slip.cohort === 'thursday' ? 'Thursday' : 'Tuesday'} cohort`}
      title={slip.ecd_name}
      badges={<StatusBadge kind="pickingSlip" status={state}>{SLIP_STATE_LABEL[state] ?? state}</StatusBadge>}
      actions={(
        <>
          {slip.status === 'pending' ? (
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <Pencil /> Edit slip
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onPrintLabel}>
            <Printer /> Print picking slip
          </Button>
        </>
      )}
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Fact label="Packed" value={`${confirmed} of ${total}`} />
        <Fact label="Flagged" value={flagged || '—'} />
        <Fact label="Pallet ref" value={slip.pallet_ref || '—'} />
        <Fact label="Children" value={slip.child_count ?? '—'} />
      </dl>

      <Section title="Who is packing it">
        <p className="mb-3 text-sm">
          {slip.status === 'pending' ? 'Nobody yet — it is on the floor for anyone to claim, worker or guest. Assign it only to give it to one person.'
            : packers(slip) ? packers(slip)
            : '—'}
        </p>

        {canAssign(slip) ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <WorkerSelect
                id="slip-assign" label="Assign to a worker" workers={workers}
                exclude={[slip.assigned_to].filter(Boolean)} value={assignTo} onChange={setAssignTo}
              />
              <Button
                type="button" size="sm" disabled={!assignTo || busy}
                onClick={() => onAssign(Number(assignTo))}
              >
                <UserRoundCheck /> {slip.status === 'pending' ? 'Assign' : 'Reassign'}
              </Button>
              {canRelease(slip) ? (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRelease}>
                  <Undo2 /> Assign to floor
                </Button>
              ) : null}
            </div>

            {/* Only once a first packer holds the slip, and only one. */}
            {slip.status === 'in_progress' && !slip.assigned_to_2 ? (
              <div className="flex flex-wrap items-center gap-2">
                <WorkerSelect
                  id="slip-second" label="Add a second packer" workers={workers}
                  exclude={[slip.assigned_to].filter(Boolean)} value={secondTo} onChange={setSecondTo}
                />
                <Button
                  type="button" size="sm" variant="outline" disabled={!secondTo || busy}
                  onClick={() => onAddSecond(Number(secondTo))}
                >
                  <UserPlus /> Add helper
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title="Items">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lines on this slip.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => {
              const comment = [item.flag_reason, item.packer_note].filter(Boolean).join(' · ');
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm">{item.product_name}</p>
                    {comment ? <p className="break-words text-xs text-muted-foreground">{comment}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums">{fmtQty(item.required_quantity, item.unit)}</p>
                    <p className={`text-xs ${item.status === 'flagged' ? 'text-danger' : 'text-muted-foreground'}`}>
                      {ITEM_STATUS[item.status] ?? item.status}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </DetailPanel>
  );
}
