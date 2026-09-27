// ─────────────────────────────────────────────────────────────
// server/src/services/adminActivity.service.js
//
// The admin Activity and Archive screens. The repository gathers the
// rows; this puts them in words ("confirmed an item on Little Stars
// ECD's pallet"), names the area of the warehouse, and checks the
// filters. Admin only (admin.routes.js).
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/adminActivity.repository.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;
const DAY = 86400000;

const AREAS = {
  picking: 'Packing', dispatch: 'Dispatch', stock: 'Stock', purchasing: 'Purchasing',
  receiving: 'Receiving', donations: 'Donations', decanting: 'Decanting', compost: 'Feed the Soil',
  volunteers: 'Volunteers', admin: 'Admin',
};

const AUDIT_AREAS = {
  donation: 'Donations', love_activism_event: 'Volunteers', event_timeslot: 'Volunteers',
  attendance: 'Volunteers', volunteer_booking: 'Volunteers', pending_product_review: 'Donations',
  collection_kit_record: 'Feed the Soil', user: 'Admin', product: 'Admin', purchase_order: 'Purchasing',
  community_request: 'Benevolent requests',
};

const humanise = (s) => String(s ?? '').replace(/_/g, ' ').toLowerCase();
const qty = (d) => (d?.quantity != null ? ` ${Number(d.quantity) > 0 ? '+' : ''}${Number(d.quantity)} ${d.unit ?? ''}`.trimEnd() : '');

// verb → sentence, per source. `s` is the subject.
const PHRASES = {
  picking: {
    assigned: (s) => `claimed ${s}'s pallet`,
    item_confirmed: (s) => `confirmed an item on ${s}'s pallet`,
    item_flagged: (s) => `flagged an item on ${s}'s pallet`,
    item_variance: (s) => `packed a different quantity on ${s}'s pallet`,
    completed: (s) => `finished packing ${s}'s pallet`,
    dispatched: (s) => `dispatched ${s}'s pallet`,
    generated_batch: (s) => `generated ${s}`,
    no_order_lines: (s) => `skipped ${s}: no standing order`,
    stock_shortfall: (s) => `hit a stock shortfall on ${s}'s pallet`,
    not_collected: (s) => `marked ${s}'s pallet as not collected`,
    late_collected: (s) => `recorded a late collection for ${s}`,
  },
  dispatch: {
    collected: (s) => `released ${s}'s pallet at the gate`,
    not_collected: (s) => `recorded ${s} as not collected`,
    late_collected: (s) => `released ${s}'s pallet late`,
    flagged: (s) => `flagged ${s}'s pallet at the gate`,
  },
  stock: {
    adjustment: (s, d) => `adjusted stock: ${s}${qty(d)}${d?.reason ? ` (${d.reason})` : ''}`,
    flagged: (s, d) => `flagged ${s ?? 'an item'} for the manager${d?.reason ? `: ${d.reason}` : ''}`,
    count_started: (s) => `started ${s}`,
    count_approved: (s) => `approved ${s}`,
  },
  purchasing: { created: (s) => `raised purchase order ${s}` },
  receiving: { received: (s) => `received a delivery from ${s}` },
  donations: { recorded: (s, d) => `recorded ${s}${d?.value ? ` (R${Number(d.value).toLocaleString('en-ZA')})` : ''}` },
  decanting: { recorded: (s) => `recorded the decanting sheet, ${s.toLowerCase()}` },
  compost: { logged: (s, d) => `logged compost from ${s}${d?.kg ? `, ${Number(d.kg)} kg` : ''}` },
  volunteers: { created: (s) => `created the volunteer event "${s}"` },
  admin: {
    supplier_added: (s) => `added the supplier ${s}`,
    supplier_deleted: (s) => `deleted the supplier ${s}`,
    product_deleted: (s) => `deleted the product ${s}`,
    user_deleted: (s) => `deleted the user account ${s}`,
  },
};

// audit_log: its actions are free text, so word them generically.
const auditSentence = (verb, entityType) => {
  const thing = humanise(entityType);
  const v = humanise(verb);
  const map = {
    create: `created a ${thing}`, update: `updated a ${thing}`, cancel: `cancelled a ${thing}`,
    close: `closed a ${thing}`, 'check in': 'checked a volunteer in', 'check out': 'checked a volunteer out',
    'walk in': 'booked a walk-in volunteer', 'book space': 'booked an event space',
    'create product': 'created a product from a donation review', created: `created a ${thing}`,
    dispatched: `dispatched a ${thing}`, 'section18a certificate issued': 'issued a Section 18A certificate',
  };
  return map[v] ?? `${v} (${thing})`;
};

export const describe = (row) => {
  if (row.source === 'audit') {
    return { area: AUDIT_AREAS[row.subject] ?? 'Other', text: auditSentence(row.verb, row.subject) };
  }
  const phrase = PHRASES[row.source]?.[row.verb];
  const subject = row.subject ?? 'an item';
  return {
    area: AREAS[row.source] ?? 'Other',
    text: phrase ? phrase(subject, row.detail) : `${humanise(row.verb)}: ${subject}`,
  };
};

const todaySAST = () => new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10);

export const listActivity = async (query = {}) => {
  const to = query.to || todaySAST();
  const from = query.from || new Date(Date.parse(to) - 29 * DAY).toISOString().slice(0, 10);
  if (!ISO.test(from) || !ISO.test(to)) throw fail(400, 'Dates must be YYYY-MM-DD.');
  const days = (Date.parse(to) - Date.parse(from)) / DAY;
  if (Number.isNaN(days) || days < 0) throw fail(400, 'The start date must be on or before the end date.');
  if (days > MAX_DAYS) throw fail(400, 'Choose a period of a year or less.');

  let actorId = null;
  if (query.user === 'system') actorId = 'system';
  else if (query.user) {
    actorId = Number(query.user);
    if (!Number.isInteger(actorId) || actorId <= 0) throw fail(400, 'Unknown user.');
  }

  const rows = await repo.listActivity({ from, to, actorId });
  const entries = rows.map((r, i) => {
    const { area, text } = describe(r);
    return {
      id: `${r.source}-${new Date(r.at).getTime()}-${i}`,
      at: r.at,
      actor: r.actor_id
        ? { id: r.actor_id, name: r.actor_name || r.username, username: r.username, role: r.actor_role }
        : null,
      area, text,
      source: r.source, verb: r.verb, subject: r.subject,
      link: r.screen ? { screen: r.screen, id: r.record_id } : null,
      detail: r.source === 'audit' ? r.detail : (r.detail ?? null),
    };
  });

  // Who was busiest in the period, for the summary chips.
  const byPerson = new Map();
  for (const e of entries) {
    const key = e.actor ? e.actor.id : 'system';
    const p = byPerson.get(key) ?? { id: key, name: e.actor?.name ?? 'System', role: e.actor?.role ?? null, count: 0, last: e.at };
    p.count += 1;
    if (e.at > p.last) p.last = e.at;
    byPerson.set(key, p);
  }

  return {
    from, to, entries,
    people: [...byPerson.values()].sort((a, b) => b.count - a.count),
    areas: [...new Set(entries.map((e) => e.area))].sort(),
    truncated: rows.length >= 2000,
  };
};

const KIND_LABELS = {
  user: 'User', product: 'Product', supplier: 'Supplier', beneficiary: 'ECD centre',
  programme: 'Programme', storage_location: 'Storage location', event_space: 'Event space',
};
// Only these have a reactivation endpoint; a deleted one never comes back.
const RESTORABLE_KINDS = new Set(['user', 'product', 'supplier', 'beneficiary']);

export const listArchived = async () => {
  const rows = await repo.listArchived();
  return rows.map((r) => ({
    kind: r.kind,
    kindLabel: KIND_LABELS[r.kind] ?? r.kind,
    id: r.id,
    name: r.name,
    detail: r.detail,
    state: r.state,
    at: r.at,
    by: r.by_name || null,
    restorable: r.state === 'deactivated' && RESTORABLE_KINDS.has(r.kind),
  }));
};

export default { listActivity, listArchived, describe };
