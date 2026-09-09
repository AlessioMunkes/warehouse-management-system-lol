// ─────────────────────────────────────────────────────────────
// server/src/repositories/eventSpace.repository.js
//
// All SQL for event_spaces.
// Database access only — no lifecycle rules, no deactivation
// decisions. The service layer owns whether a space may be
// deactivated; here we only persist it.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const SPACE_COLUMNS = `
  space_id, space_name, description, location, is_active,
  created_at, updated_at
`;

// ── Create an event space ─────────────────────────────────────
const createSpace = async ({ spaceName, description, location, is_active }, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO public.event_spaces
       (space_name, description, location, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING ${SPACE_COLUMNS}`,
    [spaceName, description ?? null, location ?? null, is_active ?? true]
  );
  return rows[0];
};

// ── One space by id ───────────────────────────────────────────
const findById = async (spaceId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${SPACE_COLUMNS} FROM public.event_spaces
       WHERE space_id = $1`,
    [spaceId]
  );
  return rows[0] ?? null;
};

const findByName = async (spaceName, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${SPACE_COLUMNS} FROM public.event_spaces
       WHERE LOWER(space_name) = LOWER($1)
       LIMIT 1`,
    [spaceName]
  );
  return rows[0] ?? null;
};

// ── List spaces with persistence-level filters ────────────────
const findAll = async ({ isActive = null } = {}, client = pool) => {
  const params = [];
  const where = [];

  if (isActive !== null) {
    params.push(isActive);
    where.push(`is_active = $${params.length}`);
  }

  const { rows } = await client.query(
    `SELECT ${SPACE_COLUMNS} FROM public.event_spaces
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY space_name ASC, created_at ASC`,
    params
  );
  return rows;
};

// ── Update only mutable space fields ─────────────────────────
// space_id and created_at are intentionally absent.
const UPDATABLE = {
  spaceName:  'space_name',
  description: 'description',
  location:   'location',
  isActive:   'is_active',
};

const updateSpace = async (spaceId, changes, client = pool) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
    params.push(changes[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (!sets.length) return findById(spaceId, client);

  params.push(spaceId);
  const { rows } = await client.query(
    `UPDATE public.event_spaces
         SET ${sets.join(', ')}, updated_at = NOW()
       WHERE space_id = $${params.length}
       RETURNING ${SPACE_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
};

export default {
  createSpace,
  findById,
  findByName,
  findAll,
  updateSpace,
};
