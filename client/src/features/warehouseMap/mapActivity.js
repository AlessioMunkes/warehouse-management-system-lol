// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/mapActivity.js
//
// What is happening in the warehouse today, worked out from the map's
// answer (warehouseMap.service.js: packed pallets in the areas, and
// `day`, the day's figures), with no React in it. The Today strip, the
// gates, their trucks and the route lines all read from here.
//
//   dispatch gate    on a collection day, each centre collecting today
//                    (a slip due today): its vehicle waits at the gate,
//                    named, once its pallet is packed and until it is
//                    collected. As centres collect, their vehicle and
//                    pallet leave and the gate's count goes down. A
//                    pallet missed on an earlier day is an alert, not a
//                    vehicle.
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
// Centres' vehicles queued at the dispatch gate; the rest are counted.
export const MAX_VEHICLES = 4;

const COLLECTED = ['collected', 'late_collected'];

/**
 * Where a centre collecting today is in the day:
 *   collected   collected (its pallet has left)
 *   missed      marked not collected
 *   waiting     packed, at the gate to collect
 *   packing     being packed
 *   to_pack     not started
 */
export const collectionState = (c) => {
  if (COLLECTED.includes(c.dispatchStatus) || c.slipStatus === 'dispatched') return 'collected';
  if (c.dispatchStatus === 'not_collected') return 'missed';
  if (c.slipStatus === 'complete') return 'waiting';
  if (c.slipStatus === 'in_progress') return 'packing';
  return 'to_pack';
};

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
  const collections = (day.collections ?? []).map((c) => ({ ...c, state: collectionState(c) }));
  const by = (state) => collections.filter((c) => c.state === state);
  const waitingNow = by('waiting');
  const collected = by('collected');
  const missed = by('missed');
  const remaining = collections.length - collected.length - missed.length;
  return {
    dispatch: {
      ready,
      overdue,
      dueToday,
      later,
      collections,
      waiting: waitingNow,
      packing: by('packing'),
      toPack: by('to_pack'),
      collected,
      missed,
      remaining,
      total: collections.length,
      nextCollection: day.nextCollection ?? null,
      collectedToday: day.collectedToday ?? collected.length,
      notCollectedToday: day.notCollectedToday ?? missed.length,
      // A vehicle for each centre waiting at the gate, named.
      vehicles: waitingNow.slice(0, MAX_VEHICLES).map((c) => ({ id: c.id, name: c.name })),
      trucks: Math.min(waitingNow.length, MAX_VEHICLES),
      truckCount: waitingNow.length,
      tone: overdue.length || missed.length ? 'bad' : 'violet',
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
// "Tuesday 21 Oct", for the next collection day.
export const dayLabel = (day) => (day
  ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
  : '');

/**
 * The Today strip, card by card: { id, label, value, detail, tone }.
 * A figure the server could not read is left out rather than shown as 0.
 */
export const todayCards = (map, activity, { needing = 0 } = {}) => {
  const day = map?.day ?? {};
  const { dispatch, receiving } = activity;
  const cards = [];

  cards.push(dispatch.total ? {
    id: 'dispatch',
    label: 'Collections',
    value: `${dispatch.collected.length} of ${dispatch.total} collected`,
    detail: [
      dispatch.waiting.length ? `${plural(dispatch.waiting.length, 'centre')} at the gate` : null,
      dispatch.packing.length + dispatch.toPack.length ? `${dispatch.packing.length + dispatch.toPack.length} still packing` : null,
      dispatch.missed.length ? `${dispatch.missed.length} not collected` : null,
      dispatch.overdue.length ? `${plural(dispatch.overdue.length, 'pallet')} missed earlier` : null,
    ].filter(Boolean).join(' · ') || 'All collected',
    tone: dispatch.missed.length || dispatch.overdue.length ? 'bad' : dispatch.remaining ? 'violet' : 'good',
  } : {
    id: 'dispatch',
    label: 'Collections',
    value: 'None today',
    detail: [
      dispatch.nextCollection ? `Next: ${dayLabel(dispatch.nextCollection.day)}, ${plural(dispatch.nextCollection.centres, 'centre')}` : null,
      dispatch.overdue.length ? `${plural(dispatch.overdue.length, 'pallet')} missed earlier` : null,
    ].filter(Boolean).join(' · ') || 'Not a collection day',
    tone: dispatch.overdue.length ? 'bad' : 'neutral',
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
  if (dispatch && staging && (dispatch.gate.waiting?.length || dispatch.gate.ready.length)) {
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
