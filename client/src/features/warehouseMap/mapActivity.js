// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/mapActivity.js
//
// What is happening in the warehouse today, worked out from the map's
// answer (warehouseMap.service.js: packed pallets in the areas, and
// `day`, the day's figures), with no React in it. The Today strip, the
// gates, their trucks and the route lines all read from here.
//
//   dispatch gate    a truck waits while packed pallets are due to be
//                    collected today or are past their day (red then)
//   receiving gate   a truck waits while a purchase order is expected
//                    today or is late (amber then); a delivery note
//                    recorded today for it means it has arrived
//
// Several gates of a kind: the first one drawn takes the day's trucks.
// Days are the server's South African 'YYYY-MM-DD'.
// ─────────────────────────────────────────────────────────────
import { palletDue } from './mapIndicators';

export const GATE_KINDS = ['dispatch_gate', 'receiving_gate'];
export const isGate = (area) => GATE_KINDS.includes(area?.kind);
export const MAX_TRUCKS = 2;

const allPallets = (map) => [
  ...(map?.areas ?? []).flatMap((a) => a.pallets ?? []),
  ...(map?.unstagedPallets ?? []),
];

/** The day at each gate: { dispatch, receiving }. */
export const gateActivity = (map) => {
  const today = map?.today;
  const pallets = allPallets(map);
  const overdue = pallets.filter((p) => palletDue(p, today) === 'overdue');
  const dueToday = pallets.filter((p) => palletDue(p, today) === 'today');
  const later = pallets.length - overdue.length - dueToday.length;

  const day = map?.day ?? {};
  const inbound = day.inbound ?? [];
  const arrived = new Set((day.receivedToday ?? []).map((d) => d.po_number));
  const waiting = inbound.filter((po) => !arrived.has(po.po_number));
  const expected = waiting.filter((po) => po.expected_on === today);
  const late = waiting.filter((po) => po.expected_on < today);

  const ready = [...overdue, ...dueToday];
  return {
    dispatch: {
      ready,
      overdue,
      dueToday,
      later,
      collectedToday: day.collectedToday ?? 0,
      notCollectedToday: day.notCollectedToday ?? 0,
      trucks: Math.min(ready.length > 0 ? Math.ceil(ready.length / 12) : 0, MAX_TRUCKS),
      truckCount: ready.length,
      tone: overdue.length ? 'bad' : 'violet',
    },
    receiving: {
      expected,
      late,
      receivedToday: day.receivedToday ?? [],
      trucks: Math.min(expected.length + late.length, MAX_TRUCKS),
      truckCount: expected.length + late.length,
      tone: late.length ? 'warn' : 'info',
    },
  };
};

/**
 * The areas, with the day put on the first gate of each kind (area.gate),
 * and how many pallets are being packed on the first staging area
 * (area.packingNow).
 */
export const withGates = (areas, activity, packing = 0) => {
  const taken = new Set();
  return areas.map((a) => {
    if (a.kind === 'staging' && !taken.has('staging')) {
      taken.add('staging');
      return packing ? { ...a, packingNow: packing } : a;
    }
    if (!isGate(a) || taken.has(a.kind)) return a;
    taken.add(a.kind);
    return { ...a, gate: a.kind === 'dispatch_gate' ? { kind: 'dispatch', ...activity.dispatch } : { kind: 'receiving', ...activity.receiving } };
  });
};

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/**
 * The Today strip, card by card: { id, label, value, detail, tone }.
 * A figure the server could not read is left out rather than shown as 0.
 */
export const todayCards = (map, activity, { needing = 0 } = {}) => {
  const day = map?.day ?? {};
  const { dispatch, receiving } = activity;
  const cards = [];

  cards.push({
    id: 'dispatch',
    label: 'Collections',
    value: `${dispatch.collectedToday} collected`,
    detail: [
      dispatch.ready.length ? `${plural(dispatch.ready.length, 'pallet')} ready` : 'No pallets waiting',
      dispatch.overdue.length ? `${dispatch.overdue.length} overdue` : null,
      day.toPackToday ? `${day.toPackToday} still to pack` : null,
    ].filter(Boolean).join(' · '),
    tone: dispatch.overdue.length ? 'bad' : dispatch.ready.length ? 'violet' : 'neutral',
  });

  cards.push({
    id: 'receiving',
    label: 'Deliveries',
    value: `${receiving.receivedToday.length} received`,
    detail: [
      receiving.expected.length ? `${plural(receiving.expected.length, 'delivery', 'deliveries')} expected` : 'None expected today',
      receiving.late.length ? `${receiving.late.length} late` : null,
    ].filter(Boolean).join(' · '),
    tone: receiving.late.length ? 'warn' : receiving.expected.length ? 'info' : 'neutral',
  });

  if (day.packing !== null && day.packing !== undefined) {
    cards.push({ id: 'packing', label: 'Packing now', value: plural(day.packing, 'pallet'), detail: 'Slips being packed', tone: day.packing ? 'good' : 'neutral' });
  }
  if (day.volunteersOnSite !== null && day.volunteersOnSite !== undefined) {
    cards.push({ id: 'people', label: 'On site', value: plural(day.volunteersOnSite, 'volunteer'), detail: 'Signed in and not out', tone: 'neutral' });
  }
  if (day.donationsToday !== null && day.donationsToday !== undefined) {
    cards.push({ id: 'donations', label: 'Donations', value: `${day.donationsToday} today`, detail: day.benevolentWaiting ? `${plural(day.benevolentWaiting, 'benevolent request')} waiting` : 'Recorded at intake', tone: 'neutral' });
  }
  cards.push({ id: 'attention', label: 'Needs attention', value: plural(needing, 'area'), detail: needing ? 'Flagged on the map' : 'Nothing flagged', tone: needing ? 'bad' : 'good' });
  return cards;
};

// ── Where things go, for the route lines ──────────────────────
const centre = (a) => ({ x: a.x + a.w / 2, y: a.y + a.h / 2 });

/**
 * Lines along the floor for what moves today: from the staging area to
 * the dispatch gate while pallets wait, and from the receiving gate to
 * the nearest store while a delivery is expected. [{ id, from, to, tone }]
 */
export const routesFor = (areas) => {
  const routes = [];
  const dispatch = areas.find((a) => a.gate?.kind === 'dispatch');
  const staging = areas.find((a) => a.kind === 'staging' && a.pallets?.length);
  if (dispatch && staging && dispatch.gate.ready.length) {
    routes.push({ id: 'out', from: centre(staging), to: centre(dispatch), tone: dispatch.gate.tone });
  }
  const receiving = areas.find((a) => a.gate?.kind === 'receiving');
  if (receiving && receiving.gate.truckCount) {
    const c = centre(receiving);
    const store = areas
      .filter((a) => a.kind === 'dry' || a.kind === 'cold' || a.kind === 'floor')
      .sort((p, q) => Math.hypot(centre(p).x - c.x, centre(p).y - c.y) - Math.hypot(centre(q).x - c.x, centre(q).y - c.y))[0];
    if (store) routes.push({ id: 'in', from: c, to: centre(store), tone: receiving.gate.tone });
  }
  return routes;
};
