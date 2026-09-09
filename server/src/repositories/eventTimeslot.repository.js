// ─────────────────────────────────────────────────────────────
// server/src/repositories/eventTimeslot.repository.js
//
// All SQL for event_timeslots.
// Database access only — no overlap decisions, no capacity
// decisions. The service layer owns whether a slot may be
// created/updated; here we only persist it and return candidate
// overlaps for the service to evaluate.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const TIMESLOT_COLUMNS = `
  timeslot_id, event_id, space_id, start_time, end_time,
  capacity, status, created_at, updated_at
`;

// ── Create a timeslot ─────────────────────────────────────────
const createTimeslot = async ({
  eventId, spaceId, startTime, endTime, capacity, status,
}, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO public.event_timeslots
       (event_id, space_id, start_time, end_time, capacity, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${TIMESLOT_COLUMNS}`,
    [eventId, spaceId, startTime, endTime, capacity, status]
  );
  return rows[0];
};

// ── One timeslot by id ────────────────────────────────────────
const findById = async (timeslotId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${TIMESLOT_COLUMNS} FROM public.event_timeslots
       WHERE timeslot_id = $1`,
    [timeslotId]
  );
  return rows[0] ?? null;
};

// ── All timeslots for an event ────────────────────────────────
const findByEventId = async (eventId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${TIMESLOT_COLUMNS} FROM public.event_timeslots
       WHERE event_id = $1
       ORDER BY start_time ASC, created_at ASC`,
    [eventId]
  );
  return rows;
};

// ── Timeslots for a specific event + space ────────────────────
const findByEventAndSpace = async (eventId, spaceId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${TIMESLOT_COLUMNS} FROM public.event_timeslots
       WHERE event_id = $1 AND space_id = $2
       ORDER BY start_time ASC, created_at ASC`,
    [eventId, spaceId]
  );
  return rows;
};

// ── Update only mutable timeslot fields ───────────────────────
// timeslot_id and created_at are intentionally absent.
const UPDATABLE = {
  eventId:   'event_id',
  spaceId:   'space_id',
  startTime: 'start_time',
  endTime:   'end_time',
  capacity:  'capacity',
  status:    'status',
};

const updateTimeslot = async (timeslotId, changes, client = pool) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
    params.push(changes[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (!sets.length) return findById(timeslotId, client);

  params.push(timeslotId);
  const { rows } = await client.query(
    `UPDATE public.event_timeslots
         SET ${sets.join(', ')}, updated_at = NOW()
       WHERE timeslot_id = $${params.length}
       RETURNING ${TIMESLOT_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
};

// ── Find candidate overlapping timeslots ──────────────────────
// Returns POSSIBLE overlaps only. The service decides whether
// they are actually allowed. Standard interval-overlap test:
// existing.start < requested.end AND existing.end > requested.start.
const findPotentialOverlaps = async (
  eventId,
  spaceId,
  startTime,
  endTime,
  excludeTimeslotId = null,
  client = pool
) => {
  const params = [eventId, spaceId, endTime, startTime];
  const where = [
    'event_id = $1',
    'space_id = $2',
    'start_time < $3',
    'end_time > $4',
  ];

  if (excludeTimeslotId !== null) {
    params.push(excludeTimeslotId);
    where.push(`timeslot_id <> $${params.length}`);
  }

  const { rows } = await client.query(
    `SELECT ${TIMESLOT_COLUMNS} FROM public.event_timeslots
       WHERE ${where.join(' AND ')}
       ORDER BY start_time ASC`,
    params
  );
  return rows;
};

export default {
  createTimeslot,
  findById,
  findByEventId,
  findByEventAndSpace,
  updateTimeslot,
  findPotentialOverlaps,
};
