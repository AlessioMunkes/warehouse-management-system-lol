// ─────────────────────────────────────────────────────────────
// server/src/repositories/loveActivismEvent.repository.js
//
// All SQL for love_activism_events.
// Database access only — no lifecycle rules, no audit
// orchestration, no sync behaviour. The service layer owns what
// a status change means; here we only persist it.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const EVENT_COLUMNS = `
  event_id, event_name, description, event_date, venue_name, address, status,
  created_by, created_at, updated_at
`;

// ── Create a Love Activism event ─────────────────────────────
const createEvent = async ({ eventName, description, eventDate, venueName, address, status, createdBy }, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO public.love_activism_events
       (event_name, description, event_date, venue_name, address, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${EVENT_COLUMNS}`,
    [eventName, description ?? null, eventDate, venueName ?? null, address ?? null, status, createdBy]
  );
  return rows[0];
};

// ── One event by id ───────────────────────────────────────────
const findById = async (eventId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${EVENT_COLUMNS} FROM public.love_activism_events
      WHERE event_id = $1`,
    [eventId]
  );
  return rows[0] ?? null;
};

// ── List events with persistence-level filters ────────────────
// Only filters the architecture needs in V1. Any other narrowing
// is the service's job, not a generic search API.
const findAll = async ({ status = null, eventDate = null } = {}, client = pool) => {
  const params = [];
  const where = [];

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (eventDate) {
    params.push(eventDate);
    where.push(`event_date = $${params.length}`);
  }

  const { rows } = await client.query(
    `SELECT ${EVENT_COLUMNS} FROM public.love_activism_events
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY event_date ASC, created_at ASC`,
    params
  );
  return rows;
};

// ── Update only mutable event fields ──────────────────────────
// event_id, created_by and created_at are intentionally absent:
// they are immutable and must never reach a SET clause.
const UPDATABLE = {
  eventName:   'event_name',
  description: 'description',
  eventDate:   'event_date',
  venueName:   'venue_name',
  address:     'address',
  status:      'status',
};

const updateEvent = async (eventId, changes, client = pool) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
    params.push(changes[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (!sets.length) return findById(eventId, client);

  params.push(eventId);
  const { rows } = await client.query(
    `UPDATE public.love_activism_events
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE event_id = $${params.length}
      RETURNING ${EVENT_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
};

export default {
  createEvent,
  findById,
  findAll,
  updateEvent,
};
