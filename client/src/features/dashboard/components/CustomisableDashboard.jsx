// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/components/CustomisableDashboard.jsx
//
// The manager and admin home screens: a strip of number tiles, then a
// grid of charts and lists, each one chosen by the person from
// widgetCatalog.jsx.
//
// Customise turns on a small toolbar on every widget (move earlier,
// move later, remove) and an "Add a widget" list of everything this
// role can have that is not already showing. Done turns it off.
// Nothing is dragged: arrows work the same with a mouse, a finger and
// a keyboard, and nobody has to hit a moving target on a tablet.
//
// DATA
// The shared sources (summary, worker counts, users, donation queue)
// are fetched once here, and only if a widget on the board needs
// them. Chart panels fetch their own report.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { GripVertical, Plus, Replace, RotateCcw, Settings2, X } from 'lucide-react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import dashboardAPI from '../../../services/dashboardAPI';
import donationManagementAPI from '../../../services/donationManagementAPI';
import gmailAPI from '../../../services/gmailAPI';
import { getUsers } from '../../../services/userAPI';
import { getProducts } from '../../../services/productAPI';
import { getSuppliers } from '../../../services/supplierAPI';
import { getGuestLog } from '../../../services/volunteerAPI';
import { PERIODS, periodById } from '../chartTheme';
import { getWidget, widgetsForRole, sizeOf } from '../widgetCatalog';
import useDashboardLayout, { panelSlots } from '../useDashboardLayout';

// Each shared source, fetched once per board and only if a widget on
// it (or the page's greeting) needs it. Manager sources are the
// operational summary and worker counts; the rest are the admin's.
const countBy = (rows, field) => rows.reduce((acc, r) => ({ ...acc, [r[field]]: (acc[r[field]] ?? 0) + 1 }), {});
const SOURCES = {
  summary:   () => dashboardAPI.getDashboardSummary(),
  myWork:    () => dashboardAPI.getMyWork(),
  users:     () => getUsers({ includeInactive: true }),
  donations: () => donationManagementAPI.getAttentionCounts().then((c) => c.total),
  s18a:      () => donationManagementAPI.getSection18AQueue().then((rows) => countBy(rows, 'section_18a_status')),
  gmail:     () => gmailAPI.getStatus(),
  products:  () => getProducts(),
  suppliers: () => getSuppliers(),
  visits:    () => getGuestLog(),
};

/** Fetch each shared source the board needs, once. */
function useSources(needed) {
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const key = [...needed].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    // Same quiet retry as ReportPanel: a restarting server answers
    // 502/503 for a few seconds, which is not worth a broken tile.
    const load = (name, attempt) => {
      // Inside a promise, so a source that throws before it even
      // starts fails that one figure rather than the whole board.
      Promise.resolve().then(() => SOURCES[name]())
        .then((value) => { if (!cancelled) setData((d) => ({ ...d, [name]: value })); })
        .catch((err) => {
          if (cancelled) return;
          if ([502, 503, 504].includes(err.status) && attempt < 4) {
            timers.push(setTimeout(() => load(name, attempt + 1), 3000));
          } else {
            setErrors((e) => ({ ...e, [name]: err.message }));
          }
        });
    };
    for (const name of key.split(',').filter(Boolean)) load(name, 0);
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [key]);

  return { data, errors };
}

const ready = (widget, data) => (widget.needs ?? []).every((n) => data[n] !== undefined);

// While customising, each widget carries a handle to drag it by, and
// Replace and Remove. The handle works from the keyboard too: focus it,
// Space to pick the widget up, the arrow keys to move it, Space to put
// it down (Escape puts it back).
function EditBar({ id, handle, onRemove, onReplace }) {
  const title = getWidget(id)?.title;
  return (
    <div className="absolute right-1.5 top-1.5 z-10 flex gap-0.5 rounded-md border bg-surface p-0.5 shadow-sm">
      <Button
        type="button" variant="ghost" size="icon-sm"
        className="cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Drag ${title} to move it`} title="Drag to move"
        {...handle}
      >
        <GripVertical />
      </Button>
      {onReplace ? (
        <Button type="button" variant="ghost" size="icon-sm"
          onClick={() => onReplace(id)} aria-label={`Replace ${title}`} title="Replace with another of the same size">
          <Replace />
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="icon-sm"
        onClick={() => onRemove(id)} aria-label={`Remove ${title}`}>
        <X />
      </Button>
    </div>
  );
}

// One draggable widget. Only sortable while customising; otherwise it
// is an ordinary box, so nothing on a normal day can be dragged by
// accident.
function Sortable({ id, editing, as: Tag = 'div', className = '', children }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id, disabled: !editing });
  const style = {
    // Held: a touch larger, so it reads as lifted off the board.
    transform: CSS.Transform.toString(transform && { ...transform, scaleX: isDragging ? 1.02 : 1, scaleY: isDragging ? 1.02 : 1 }),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <Tag
      ref={setNodeRef}
      style={style}
      className={`${className} ${isDragging ? 'cursor-grabbing rounded-xl opacity-95 shadow-2xl ring-2 ring-ring/40' : ''}`}
    >
      {children({ ...attributes, ...listeners })}
    </Tag>
  );
}

const SIZE_LABEL = { small: 'Small', medium: 'Medium', large: 'Large' };
const SIZE_MEANS = { small: 'one number tile', medium: 'half the width', large: 'the full width' };

// A little picture of how much of the board the widget takes: the
// frame is one row of the dashboard, the filled part is the widget.
function SizeIcon({ size }) {
  const fill = { small: 4, medium: 11, large: 22 }[size];
  return (
    <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true" className="shrink-0">
      <rect x="0.5" y="0.5" width="23" height="11" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.35" />
      <rect x="1" y="1" width={fill} height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function SizeBadge({ size }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      <SizeIcon size={size} />
      {SIZE_LABEL[size]}
    </span>
  );
}

// `size` narrows the list to what fits the gap that was clicked:
// 'small' | 'medium' | 'large', or 'panel' for any chart. Null means
// everything, from the Add a widget button.
function AddWidgetDialog({ open, onOpenChange, available, onAdd, size, replacing }) {
  const fits = (w) => (!size ? true : size === 'panel' ? w.kind === 'panel' : sizeOf(w) === size);
  const shown = available.filter(fits);
  const groups = [
    { label: 'Numbers', items: shown.filter((w) => w.kind === 'tile') },
    { label: 'Charts and lists', items: shown.filter((w) => w.kind === 'panel') },
  ].filter((g) => g.items.length > 0);

  const sized = size && size !== 'panel';
  const title = replacing ? `Replace ${replacing.title}`
    : sized ? `Add a ${size} widget` : size === 'panel' ? 'Add a chart or list' : 'Add a widget';
  const blurb = replacing
    ? `Choose another ${SIZE_LABEL[size].toLowerCase()} widget to take its place.`
    : sized
      ? `These fit the space you chose — ${SIZE_LABEL[size].toLowerCase()} widgets take ${SIZE_MEANS[size]}.`
      : 'Choose what to show on your dashboard. You can remove it again at any time.';
  const verb = replacing ? 'Use' : 'Add';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{blurb}</DialogDescription>
        </DialogHeader>
        {!size ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            Sizes: <SizeBadge size="small" /> <SizeBadge size="medium" /> <SizeBadge size="large" />
          </p>
        ) : null}
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {replacing
              ? 'There is no other widget of this size left to swap in.'
              : size ? 'Every widget that fits here is already on your dashboard.' : 'Every widget is already on your dashboard.'}
          </p>
        ) : groups.map((g) => (
          <div key={g.label}>
            <h3 className="mb-2 mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
            <ul className="space-y-2">
              {g.items.map((w) => (
                <li key={w.id} className="flex items-start justify-between gap-3 rounded-[4px] border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{w.title}</p>
                      <SizeBadge size={sizeOf(w)} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{w.description}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => onAdd(w.id)}
                    aria-label={`${verb} ${w.title}`}>
                    {replacing ? <Replace /> : <Plus />} {verb}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}

// An empty space on the board while customising. Its size is the
// size of the gap, so what it offers is what will fit there.
function AddSlot({ size, label, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed border-line-strong p-3 text-muted-foreground transition-colors hover:border-ink hover:text-ink ${className}`}
    >
      <span className="flex size-9 items-center justify-center rounded-full border-2 border-current">
        <Plus className="size-5" />
      </span>
      <span className="text-xs font-medium">{label}</span>
      {size !== 'panel' ? <SizeBadge size={size} /> : null}
    </button>
  );
}

// Month / 3 months / Year, on every dated chart. Shown in normal use,
// not just while customising — it is how you read the chart.
function PeriodMenu({ title, value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-7 w-28 shrink-0 text-xs" aria-label={`Period for ${title}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERIODS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export default function CustomisableDashboard({ user, always = [], onData }) {
  const role = user?.role;
  const { ids, periods, add, remove, replace, reorder, setPeriod, reset } = useDashboardLayout(user);
  // A few pixels of movement before a drag starts, so a click on the
  // handle is still a click; arrow keys move a picked-up widget.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) reorder(active.id, over.id);
  };
  const [editing, setEditing] = useState(false);
  // null when closed; otherwise which gap was clicked (or none, for
  // the toolbar button) and so what size to offer.
  const [adding, setAdding] = useState(null);

  const widgets = ids.map(getWidget).filter(Boolean);
  const tiles = widgets.filter((w) => w.kind === 'tile');
  const panels = widgets.filter((w) => w.kind === 'panel');

  // `always` is what the page's greeting line reads even when no widget
  // does; it gets the loaded data back through onData.
  const needed = new Set([...always, ...widgets.flatMap((w) => [...(w.needs ?? []), ...(w.wants ?? [])])]);
  const { data, errors } = useSources(needed);
  useEffect(() => { onData?.(data); }, [data, onData]);
  const periodFor = (w) => periods[w.id] ?? w.defaultPeriod ?? null;

  const available = widgetsForRole(role).filter((w) => !ids.includes(w.id));
  // Only show a + where there is something left that would fit it.
  const hasRoom = (size) => available.some((w) => (size === 'panel' ? w.kind === 'panel' : sizeOf(w) === size));
  // Replace offers the same size only, so the board keeps its shape.
  const canReplace = (w) => hasRoom(sizeOf(w));
  const startReplace = (id) => {
    const w = getWidget(id);
    setAdding({ size: sizeOf(w), replacing: w });
  };
  const failed = [...needed].filter((n) => errors[n]);

  const body = (w) => {
    if (!ready(w, data)) {
      return (w.needs ?? []).some((n) => errors[n])
        ? <p className="text-sm text-muted-foreground">Could not load this.</p>
        : <Skeleton className={w.kind === 'tile' ? 'h-20 w-full' : 'h-32 w-full'} />;
    }
    return w.render({ role, ...data, period: periodFor(w) });
  };

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding({ size: null })}>
              <Plus /> Add a widget
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              <RotateCcw /> Reset to default
            </Button>
            <Button type="button" size="sm" onClick={() => setEditing(false)}>Done</Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Settings2 /> Customise dashboard
          </Button>
        )}
      </div>

      {editing ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Drag a widget by its handle to move it. Numbers move among numbers, charts among charts.
        </p>
      ) : null}

      {failed.length > 0 ? (
        <p role="alert" className="mb-3 text-sm text-muted-foreground">
          Some figures could not be loaded. Refresh the page to try again.
        </p>
      ) : null}

      {widgets.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Your dashboard is empty. Choose Customise dashboard, then Add a widget.
          </CardContent>
        </Card>
      ) : null}

      {tiles.length > 0 || (editing && hasRoom('small')) ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={tiles.map((w) => w.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map((w) => (
            <Sortable
              key={w.id} id={w.id} editing={editing}
              className={`relative ${editing ? 'rounded-md outline-dashed outline-1 outline-offset-2 outline-line-strong' : ''}`}
            >
              {(handle) => (
                <>
                  {body(w)}
                  {editing ? <EditBar id={w.id} handle={handle} onRemove={remove} onReplace={canReplace(w) ? startReplace : null} /> : null}
                </>
              )}
            </Sortable>
          ))}
          {editing && hasRoom('small') ? (
            <AddSlot size="small" label="Add a number" className="min-h-20"
              onClick={() => setAdding({ size: 'small', after: tiles[tiles.length - 1]?.id })} />
          ) : null}
        </div>
        </SortableContext>
        </DndContext>
      ) : null}

      {panels.length > 0 || editing ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={panels.map((w) => w.id)} strategy={rectSortingStrategy}>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {panelSlots(panels).map((slot) => {
            if (slot.gap) {
              if (!editing || !hasRoom(slot.gap)) return null;
              return (
                <AddSlot
                  key={`gap-${slot.after ?? 'start'}`}
                  size={slot.gap}
                  label={slot.gap === 'medium' ? 'Add a medium widget here' : 'Add a chart or list'}
                  className={slot.gap === 'panel' ? 'min-h-28 sm:col-span-2' : 'min-h-40'}
                  onClick={() => setAdding({ size: slot.gap, after: slot.after })}
                />
              );
            }
            const w = slot.widget;
            return (
              <Sortable key={w.id} id={w.id} editing={editing} className={`relative ${w.wide ? 'sm:col-span-2' : ''}`}>
                {(handle) => (
                  <Card className={`relative h-full ${editing ? 'outline-dashed outline-1 outline-offset-2 outline-line-strong' : ''}`}>
                    <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                      <CardTitle>{w.title}</CardTitle>
                      {/* Hidden under the edit toolbar while customising. */}
                      {w.periods && !editing ? (
                        <PeriodMenu title={w.title} value={periodById(periodFor(w)).id} onChange={(v) => setPeriod(w.id, v)} />
                      ) : null}
                    </CardHeader>
                    <CardContent>{body(w)}</CardContent>
                    {editing ? <EditBar id={w.id} handle={handle} onRemove={remove} onReplace={canReplace(w) ? startReplace : null} /> : null}
                  </Card>
                )}
              </Sortable>
            );
          })}
        </div>
        </SortableContext>
        </DndContext>
      ) : null}

      <AddWidgetDialog
        open={adding !== null}
        onOpenChange={(open) => { if (!open) setAdding(null); }}
        size={adding?.size ?? null}
        replacing={adding?.replacing ?? null}
        available={available}
        onAdd={(id) => {
          if (adding?.replacing) replace(adding.replacing.id, id);
          else add(id, adding?.after);
          // A gap or a replace takes one widget; the toolbar's list stays open for more.
          if (adding?.size) setAdding(null);
        }}
      />
    </div>
  );
}
