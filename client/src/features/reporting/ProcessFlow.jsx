// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ProcessFlow.jsx
//
// THE FLOW MAP: every route cases really took through a process, drawn
// as steps joined by connections. A thick line is a busy one; a line
// in the warning colour is off the expected route; a line going back
// up is work done again. It is the picture process-mining tools open
// on, and it works the way they do:
//
//   follow        which process: an order through to dispatch, a
//                 purchase order, packing, a donation, a request
//   routes        the list on the right is every route, commonest
//                 first. The slider shows more or fewer of them, and
//                 each can be switched on or off by itself.
//   how many /    the same map by number of cases or by the typical
//   how long      time each connection takes
//   a step        choose one to see what leads to it and what follows,
//                 and to keep only the cases that pass through it or
//                 skip it
//   a connection  choose one for its times and its slowest cases, and
//                 to keep only the cases that took it or never did
//   play          dots run along each connection, more on busier ones
//
// All of it is worked out in the browser (flowGraph.js) from the case
// paths the server sent with the process map, so every change redraws
// at once.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { Play, Pause, RotateCw, X } from 'lucide-react';
import NativeSelect from '@/components/ui/native-select';
import { duration } from './processFormat';
import { exportExcel } from '../../lib/excelExport';
import {
  START, END, NODE_W, NODE_H, variantsOf, applyFilters, filterLabel, graphOf, neighbours,
  layoutOf, edgePath, thickness, routesToCover, caseHours,
} from './flowGraph';

const count = (n) => Number(n ?? 0).toLocaleString('en-ZA');
const INK = 'var(--ink)';
const OFF_ROUTE = 'var(--warn-ink)';
const FAINT = 'var(--line-strong)';

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

function Bars({ rows, valueOf, textOf, onPick }) {
  const max = Math.max(...rows.map(valueOf), 0) || 1;
  return (
    <ul className="mt-1.5 space-y-1.5">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="text-xs">
          <div className="flex items-baseline justify-between gap-3">
            {onPick && r.pick !== false ? (
              <button type="button" onClick={() => onPick(r)} className="min-w-0 truncate text-left text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">{r.label}</button>
            ) : <span className="min-w-0 truncate text-ink">{r.label}</span>}
            <span className="shrink-0 tabular-nums text-muted-foreground">{textOf(r)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
            <div className="h-1.5 rounded-full bg-ink" style={{ width: `${Math.max(2, (valueOf(r) / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, value }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-2.5 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-ink">{value}</p>
    </div>
  );
}

const pill = 'rounded-lg border border-line px-2 py-1 text-xs font-bold text-ink hover:bg-muted/60';

export default function ProcessFlow({ flow, range }) {
  const [processId, setProcessId] = useState(flow.processes.find((p) => p.cases.length)?.id ?? flow.processes[0].id);
  const [metric, setMetric] = useState('count');          // 'count' | 'time'
  const [filters, setFilters] = useState([]);
  const [chosen, setChosen] = useState(null);             // Set of route keys, or null for the default
  const [selected, setSelected] = useState(null);         // { type: 'node', id } | { type: 'edge', key } | { type: 'route', key }
  const [hover, setHover] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);

  const process = flow.processes.find((p) => p.id === processId) ?? flow.processes[0];
  const noun = process.caseNoun;

  const inScope = useMemo(() => applyFilters(process.cases, filters), [process, filters]);
  const variants = useMemo(() => variantsOf(process, inScope), [process, inScope]);
  const shownKeys = useMemo(
    () => chosen ?? new Set(variants.slice(0, routesToCover(variants)).map((v) => v.key)),
    [chosen, variants],
  );
  const shown = useMemo(() => variants.filter((v) => shownKeys.has(v.key)), [variants, shownKeys]);
  const shownCases = useMemo(() => shown.flatMap((v) => v.cases), [shown]);
  const graph = useMemo(() => graphOf(process, shownCases), [process, shownCases]);
  // The expected route is the centre column whatever is shown, so a
  // step keeps its place as routes are switched on and off.
  const layout = useMemo(() => layoutOf(graph, process.expected), [graph, process]);

  const reset = (next = {}) => { setChosen(null); setSelected(null); setHover(null); if (next.filters) setFilters(next.filters); };
  const changeProcess = (id) => { setProcessId(id); setFilters([]); reset(); };
  const addFilter = (f) => reset({ filters: [...filters, f] });
  const removeFilter = (i) => reset({ filters: filters.filter((_, j) => j !== i) });

  const setRouteCount = (n) => { setChosen(new Set(variants.slice(0, n).map((v) => v.key))); setSelected(null); };
  const toggleRoute = (key) => {
    const next = new Set(shownKeys);
    if (next.has(key)) { if (next.size > 1) next.delete(key); } else next.add(key);
    setChosen(next);
    setSelected(null);
  };
  const onlyRoute = (key) => { setChosen(new Set([key])); setSelected({ type: 'route', key }); };

  const maxCount = Math.max(...graph.edges.map((e) => e.count), 1);
  const maxHours = Math.max(...graph.edges.map((e) => e.medianHours ?? 0), 0);
  const nodeMax = Math.max(...graph.nodes.map((n) => n.cases), 1);

  const onExpected = variants.filter((v) => v.expected).reduce((s, v) => s + v.cases.length, 0);
  const withRepeats = variants.filter((v) => v.repeats).reduce((s, v) => s + v.cases.length, 0);
  const pct = (n) => (inScope.length ? `${Math.round((n / inScope.length) * 100)}%` : '0%');

  const selectedNode = selected?.type === 'node' ? graph.nodes.find((n) => n.id === selected.id) : null;
  const selectedEdge = selected?.type === 'edge' ? graph.edges.find((e) => e.key === selected.key) : null;
  const selectedRoute = selected?.type === 'route' ? variants.find((v) => v.key === selected.key) : null;
  const nameOf = (id) => (id === START ? 'Start' : id === END ? 'End' : process.activities[id].label);
  const routeText = (v) => v.path.map(nameOf).join(' → ');

  const lit = (e) => {
    if (selectedEdge) return e.key === selectedEdge.key;
    const focus = hover ?? selectedNode?.id;
    if (focus === undefined || focus === null) return true;
    return e.from === focus || e.to === focus;
  };

  const exportRoutes = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportExcel({
        filename: `process-routes-${process.id}-${range.from}-to-${range.to}`,
        sheetName: 'Routes',
        title: `${process.label}: the routes taken`,
        subtitle: `${range.from} to ${range.to}  ·  ${count(inScope.length)} ${noun}`,
        columns: [
          { key: 'route', label: 'Route', kind: 'text' },
          { key: 'cases', label: 'Cases', kind: 'number' },
          { key: 'share', label: 'Share (%)', kind: 'number' },
          { key: 'hours', label: 'Typical time, start to end (hours)', kind: 'number' },
          { key: 'kind', label: 'Kind', kind: 'text' },
        ],
        rows: variants.map((v) => ({
          route: routeText(v), cases: v.cases.length, share: v.share,
          hours: v.medianHours === null ? null : Math.round(v.medianHours * 100) / 100,
          kind: v.expected ? 'Expected route' : v.repeats ? 'Has a repeated step' : 'Different route',
        })),
      });
    } finally {
      setExporting(false);
    }
  };

  const animate = playing && !reducedMotion();

  return (
    <div className="mt-4">
      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Follow
          <NativeSelect className="w-44" value={process.id} onChange={(e) => changeProcess(e.target.value)}>
            {flow.processes.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </NativeSelect>
        </label>
        <div role="group" aria-label="What the map measures" className="flex rounded-3xl bg-input/50 p-0.5 text-xs font-bold">
          {[['count', 'How many'], ['time', 'How long']].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={metric === id} onClick={() => setMetric(id)}
              className={`rounded-3xl px-3 py-1.5 ${metric === id ? 'bg-ink text-on-ink' : 'text-ink'}`}>{label}</button>
          ))}
        </div>
        <button type="button" onClick={() => setPlaying((v) => !v)} aria-pressed={playing} className={`${pill} inline-flex items-center gap-1.5`}>
          {playing ? <Pause aria-hidden="true" className="size-3.5" /> : <Play aria-hidden="true" className="size-3.5" />}
          {playing ? 'Stop' : 'Play the flow'}
        </button>
        {variants.length > 0 ? (
          <button type="button" onClick={exportRoutes} disabled={exporting}
            className="ml-auto text-xs font-semibold text-ink underline underline-offset-2 disabled:opacity-60">
            {exporting ? 'Preparing' : 'Export routes to Excel'}
          </button>
        ) : null}
      </div>

      {/* A process worked out, not recorded step by step, says so. */}
      {process.note ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {process.estimate ? <span className="mr-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold">Estimate</span> : null}
          {process.note.replace(/^An estimate\. /, '')}
        </p>
      ) : null}

      {filters.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Only {noun} where:</span>
          {filters.map((f, i) => (
            <button key={`${f.kind}-${i}`} type="button" onClick={() => removeFilter(i)}
              className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 font-semibold text-on-ink">
              {filterLabel(process, f)} <X aria-hidden="true" className="size-3" /><span className="sr-only">Remove</span>
            </button>
          ))}
          <button type="button" onClick={() => reset({ filters: [] })} className="font-semibold text-ink underline underline-offset-2">Clear all</button>
        </div>
      )}

      {process.cases.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No {noun} in this period.</p>
      ) : inScope.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No {noun} match all of those. Remove one to see the map again.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact label={`${noun[0].toUpperCase()}${noun.slice(1)}`} value={count(inScope.length)} />
            <Fact label="Different routes" value={count(variants.length)} />
            <Fact label="On the expected route" value={pct(onExpected)} />
            <Fact label="With a repeated step" value={pct(withRepeats)} />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
            {/* ── The map ──────────────────────────────────────── */}
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label={`${process.label}: flow map`}
                className="mx-auto block w-full min-w-[34rem] max-w-[46rem]" onMouseLeave={() => setHover(null)}>
                <defs>
                  {[['ink', INK], ['off', OFF_ROUTE], ['faint', FAINT]].map(([id, colour]) => (
                    <marker key={id} id={`flow-arrow-${id}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={colour} />
                    </marker>
                  ))}
                </defs>

                {[...graph.edges].sort((a, b) => a.count - b.count).map((e, index) => {
                  const rows = Math.abs((layout.at.get(e.to)?.row ?? 0) - (layout.at.get(e.from)?.row ?? 0));
                  const path = edgePath(layout, e.from, e.to, rows > 1 ? [0.5, 0.32, 0.68, 0.41, 0.59][index % 5] : 0.5);
                  if (!path) return null;
                  const on = lit(e);
                  const colour = !on ? FAINT : e.expected ? INK : OFF_ROUTE;
                  const marker = !on ? 'faint' : e.expected ? 'ink' : 'off';
                  const width = metric === 'count' ? thickness(e.count, maxCount) : thickness(e.medianHours, maxHours);
                  const text = metric === 'count' ? count(e.count) : (e.medianHours === null ? '' : duration(e.medianHours));
                  const ends = e.from === START || e.to === END;
                  const picked = selectedEdge?.key === e.key;
                  const label = `${nameOf(e.from)} to ${nameOf(e.to)}: ${count(e.count)} ${noun}${e.medianHours === null ? '' : `, typically ${duration(e.medianHours)}`}${e.expected ? '' : ', off the expected route'}`;
                  return (
                    <g key={e.key} role="button" tabIndex={0} aria-label={label} aria-pressed={picked} className="cursor-pointer outline-none"
                      onClick={() => setSelected(picked ? null : { type: 'edge', key: e.key })}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSelected(picked ? null : { type: 'edge', key: e.key }); } }}>
                      <title>{label}</title>
                      {/* A wide, unseen line so a thin connection is still easy to hit. */}
                      <path d={path.d} fill="none" stroke="transparent" strokeWidth={Math.max(16, width + 8)} />
                      <path d={path.d} fill="none" stroke={colour} strokeWidth={width} strokeLinecap="round"
                        strokeDasharray={ends ? '2 7' : e.back ? '7 5' : undefined}
                        opacity={on ? (picked ? 1 : 0.82) : 0.35} markerEnd={`url(#flow-arrow-${marker})`} />
                      {animate && on ? Array.from({ length: Math.min(3, 1 + Math.round((e.count / maxCount) * 2)) }).map((_, i, all) => (
                        <circle key={i} r={3.2} fill={e.expected ? INK : OFF_ROUTE}>
                          <animateMotion dur="2.4s" begin={`${(i * 2.4) / all.length}s`} repeatCount="indefinite" path={path.d} />
                        </circle>
                      )) : null}
                      {text && on ? (
                        <g>
                          <rect x={path.mid.x - (text.length * 3.3 + 6)} y={path.mid.y - 9} width={text.length * 6.6 + 12} height={18} rx={9}
                            fill="var(--surface)" stroke={picked ? INK : 'var(--line)'} />
                          <text x={path.mid.x} y={path.mid.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>{text}</text>
                        </g>
                      ) : null}
                    </g>
                  );
                })}

                {[START, END].map((id) => {
                  const p = layout.at.get(id);
                  return (
                    <g key={id}>
                      <circle cx={p.x} cy={p.y} r={13} fill={INK} />
                      <text x={p.x + 22} y={p.y + 4} fontSize="12" fontWeight="700" fill={INK}>
                        {id === START ? 'Start' : 'End'} · {count(graph.cases)}
                      </text>
                    </g>
                  );
                })}

                {graph.nodes.map((n) => {
                  const p = layout.at.get(n.id);
                  const picked = selectedNode?.id === n.id;
                  const dim = selectedEdge ? !(selectedEdge.from === n.id || selectedEdge.to === n.id) : false;
                  const label = `${n.label}: ${count(n.cases)} ${noun}${n.repeated ? `, repeated in ${count(n.repeated)}` : ''}${n.expected ? '' : ', not on the expected route'}`;
                  const choose = () => setSelected(picked ? null : { type: 'node', id: n.id });
                  return (
                    <g key={n.id} role="button" tabIndex={0} aria-label={label} aria-pressed={picked} className="cursor-pointer outline-none"
                      opacity={dim ? 0.45 : 1}
                      onMouseEnter={() => setHover(n.id)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                      onClick={choose}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(); } }}>
                      <title>{label}</title>
                      <rect x={p.x - NODE_W / 2} y={p.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={NODE_H / 2}
                        fill={picked ? INK : 'var(--card)'} stroke={picked ? INK : n.expected ? 'var(--line-strong)' : OFF_ROUTE} strokeWidth={n.expected ? 1.2 : 1.8} />
                      {/* How much of the traffic reaches this step. */}
                      <circle cx={p.x - NODE_W / 2 + 22} cy={p.y} r={6 + (n.cases / nodeMax) * 8} fill={picked ? 'var(--on-ink)' : n.expected ? INK : OFF_ROUTE} opacity={picked ? 0.9 : 0.85} />
                      <text x={p.x - NODE_W / 2 + 44} y={p.y - 2} fontSize="12.5" fontWeight="700" fill={picked ? 'var(--on-ink)' : INK}>{n.label}</text>
                      <text x={p.x - NODE_W / 2 + 44} y={p.y + 13} fontSize="10.5" fill={picked ? 'var(--on-ink)' : 'var(--ink-soft)'}>
                        {count(n.cases)}{n.repeated ? ` · repeated in ${count(n.repeated)}` : ''}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 bg-ink" /> Expected route</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 bg-warn" /> Off the expected route</span>
                <span className="inline-flex items-center gap-1.5"><RotateCw aria-hidden="true" className="size-3" /> Dashed: a step done again</span>
                <span>Thicker: {metric === 'count' ? 'more cases' : 'a longer wait'}</span>
              </p>
            </div>

            {/* ── Routes, and what is chosen ───────────────────── */}
            <div className="min-w-0 space-y-3">
              {selectedNode ? (
                <section aria-label={`${selectedNode.label}: details`} className="rounded-2xl border border-line bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">{selectedNode.label}</h3>
                    <button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold text-muted-foreground hover:text-ink">Close</button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    In {count(selectedNode.cases)} of the {count(graph.cases)} {noun} shown.
                    {selectedNode.repeated ? ` Done more than once in ${count(selectedNode.repeated)}.` : ''}
                    {selectedNode.expected ? '' : ' Not a step of the expected route.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" className={pill} onClick={() => addFilter({ kind: 'through', step: selectedNode.id })}>Only those that pass through it</button>
                    <button type="button" className={pill} onClick={() => addFilter({ kind: 'avoid', step: selectedNode.id })}>Only those that skip it</button>
                  </div>
                  <h4 className="mt-3 text-xs font-bold text-ink">What came before</h4>
                  <Bars rows={neighbours(graph, process, selectedNode.id, 'before')} valueOf={(r) => r.count} textOf={(r) => `${count(r.count)} · ${r.share}%`}
                    onPick={(r) => setSelected({ type: 'edge', key: `${r.id}>${selectedNode.id}` })} />
                  <h4 className="mt-3 text-xs font-bold text-ink">What came next</h4>
                  <Bars rows={neighbours(graph, process, selectedNode.id, 'next')} valueOf={(r) => r.count} textOf={(r) => `${count(r.count)} · ${r.share}%`}
                    onPick={(r) => setSelected({ type: 'edge', key: `${selectedNode.id}>${r.id}` })} />
                </section>
              ) : null}

              {selectedEdge ? (
                <section aria-label={`${nameOf(selectedEdge.from)} to ${nameOf(selectedEdge.to)}: details`} className="rounded-2xl border border-line bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">{nameOf(selectedEdge.from)} → {nameOf(selectedEdge.to)}</h3>
                    <button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold text-muted-foreground hover:text-ink">Close</button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {count(selectedEdge.cases)} {noun} went this way{selectedEdge.count > selectedEdge.cases ? `, ${count(selectedEdge.count)} times in all` : ''}.
                    {selectedEdge.expected ? '' : ' This is off the expected route.'}
                    {selectedEdge.back ? ' It goes back to an earlier step.' : ''}
                  </p>
                  {selectedEdge.measured > 0 ? (
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <Fact label="Typical" value={duration(selectedEdge.medianHours)} />
                      <Fact label="Average" value={duration(selectedEdge.averageHours)} />
                      <Fact label="Slow end" value={duration(selectedEdge.p90Hours)} />
                    </div>
                  ) : selectedEdge.from !== START && selectedEdge.to !== END ? (
                    <p className="mt-2 text-xs text-muted-foreground">No time was recorded for this step.</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" className={pill} onClick={() => addFilter({ kind: 'with', from: selectedEdge.from, to: selectedEdge.to })}>Only those that went this way</button>
                    <button type="button" className={pill} onClick={() => addFilter({ kind: 'without', from: selectedEdge.from, to: selectedEdge.to })}>Only those that never did</button>
                  </div>
                  {selectedEdge.timed.length > 0 ? (
                    <>
                      <h4 className="mt-3 text-xs font-bold text-ink">Slowest here</h4>
                      <Bars rows={[...selectedEdge.timed].sort((a, b) => b.hours - a.hours).slice(0, 8).map((x) => ({ label: x.c.label, hours: x.hours }))}
                        valueOf={(r) => r.hours} textOf={(r) => duration(r.hours)} />
                    </>
                  ) : (
                    <>
                      <h4 className="mt-3 text-xs font-bold text-ink">Which ones</h4>
                      <ul className="mt-1.5 space-y-1 text-xs text-ink">
                        {selectedEdge.caseList.slice(0, 8).map((c) => <li key={c.id} className="truncate">{c.label}</li>)}
                      </ul>
                    </>
                  )}
                </section>
              ) : null}

              {selectedRoute ? (
                <section aria-label="Route: details" className="rounded-2xl border border-line bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">{count(selectedRoute.cases.length)} {noun} on this route</h3>
                    <button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold text-muted-foreground hover:text-ink">Close</button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{routeText(selectedRoute)}</p>
                  <h4 className="mt-3 text-xs font-bold text-ink">Longest first</h4>
                  <Bars rows={selectedRoute.cases.map((c) => ({ label: c.label, hours: caseHours(c) ?? 0 })).sort((a, b) => b.hours - a.hours).slice(0, 10)}
                    valueOf={(r) => r.hours} textOf={(r) => duration(r.hours)} />
                </section>
              ) : null}

              <section aria-label="Routes" className="rounded-2xl border border-line bg-card p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink">Routes</h3>
                  <span className="text-xs text-muted-foreground">
                    {count(shown.length)} of {count(variants.length)} shown · {inScope.length ? Math.round((shownCases.length / inScope.length) * 100) : 0}% of {noun}
                  </span>
                </div>
                {variants.length > 1 ? (
                  <label className="mt-2 block text-xs font-semibold text-ink">
                    <span className="flex justify-between"><span>Commonest only</span><span>Every route</span></span>
                    <input type="range" min={1} max={variants.length} value={Math.min(shown.length, variants.length)} aria-label="How many routes to show"
                      onChange={(e) => setRouteCount(Number(e.target.value))} className="mt-1 w-full accent-[var(--ink)]" />
                  </label>
                ) : null}
                <ul className="mt-2 max-h-[26rem] space-y-1.5 overflow-y-auto pr-1">
                  {variants.map((v, i) => {
                    const on = shownKeys.has(v.key);
                    return (
                      <li key={v.key} className={`rounded-xl border p-2 text-xs ${on ? 'border-line-strong bg-surface' : 'border-line opacity-70'}`}>
                        <div className="flex items-start gap-2">
                          <input type="checkbox" checked={on} onChange={() => toggleRoute(v.key)} className="mt-0.5 accent-[var(--ink)]"
                            aria-label={`Show route ${i + 1}: ${routeText(v)}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                              <span className="font-bold text-ink">Route {i + 1}</span>
                              <span className="tabular-nums text-muted-foreground">{count(v.cases.length)} · {v.share}%</span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                              <div className={`h-1.5 rounded-full ${v.expected ? 'bg-ink' : 'bg-warn'}`} style={{ width: `${Math.max(2, (v.cases.length / variants[0].cases.length) * 100)}%` }} />
                            </div>
                            <p className="mt-1 text-ink">{routeText(v)}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground">
                              <span>{v.expected ? 'Expected route' : v.repeats ? 'Has a repeated step' : 'Different route'}</span>
                              {v.medianHours !== null ? <span>Typically {duration(v.medianHours)}</span> : null}
                              <button type="button" onClick={() => onlyRoute(v.key)} className="font-semibold text-ink underline underline-offset-2">Show only this</button>
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </div>

          {process.truncated ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the most recent {count(process.cases.length)} of {count(process.total)} {noun}. Choose a shorter period to see all of them.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
