// server/src/repositories/operationalGoals.repository.js
//
// Database access for operational_goals only.
// Goal rules, metric validation, progress calculation, AI explanation,
// and DTO mapping belong in future service/controller layers.
import pool from '../config/db.js';

const GOAL_COLUMNS = `
  id,
  title,
  goal_text,
  metric_id,
  metric_filters,
  goal_type,
  direction,
  target_value,
  period_start::text AS period_start,
  period_end::text AS period_end,
  comparison_type,
  goal_state,
  created_by,
  created_at,
  updated_at,
  archived_at
`;

const INSERT_COLUMNS = [
  'title',
  'goal_text',
  'metric_id',
  'metric_filters',
  'goal_type',
  'direction',
  'target_value',
  'period_start',
  'period_end',
  'comparison_type',
  'goal_state',
  'created_by',
];

const UPDATABLE = {
  title: 'title',
  goal_text: 'goal_text',
  metric_id: 'metric_id',
  metric_filters: 'metric_filters',
  goal_type: 'goal_type',
  direction: 'direction',
  target_value: 'target_value',
  period_start: 'period_start',
  period_end: 'period_end',
  comparison_type: 'comparison_type',
  goal_state: 'goal_state',
  archived_at: 'archived_at',
};

const SORTS = {
  created_at_desc: 'created_at DESC',
  period_end_asc: 'period_end ASC',
};

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export const createGoal = async (goal, client = pool) => {
  const columns = INSERT_COLUMNS.filter((column) => hasOwn(goal, column));
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const values = columns.map((column) => goal[column]);

  const { rows } = await client.query(
    `INSERT INTO operational_goals (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING ${GOAL_COLUMNS}`,
    values
  );

  return rows[0];
};

export const getGoalById = async (id, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${GOAL_COLUMNS}
       FROM operational_goals
      WHERE id = $1`,
    [id]
  );

  return rows[0] ?? null;
};

export const listGoals = async (filters = {}, client = pool) => {
  const params = [];
  const where = [];

  if (hasOwn(filters, 'goal_state')) {
    params.push(filters.goal_state);
    where.push(`goal_state = $${params.length}`);
  }

  if (hasOwn(filters, 'created_by')) {
    params.push(filters.created_by);
    where.push(`created_by = $${params.length}`);
  }

  if (hasOwn(filters, 'metric_id')) {
    params.push(filters.metric_id);
    where.push(`metric_id = $${params.length}`);
  }

  if (hasOwn(filters, 'period_start')) {
    params.push(filters.period_start);
    where.push(`period_start >= $${params.length}`);
  }

  if (hasOwn(filters, 'period_end')) {
    params.push(filters.period_end);
    where.push(`period_end <= $${params.length}`);
  }

  const orderBy = SORTS[filters.sort] || SORTS.created_at_desc;

  const { rows } = await client.query(
    `SELECT ${GOAL_COLUMNS}
       FROM operational_goals
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${orderBy}`,
    params
  );

  return rows;
};

export const updateGoal = async (id, updates, client = pool) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!hasOwn(updates, key)) continue;
    params.push(updates[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (!sets.length) return getGoalById(id, client);

  params.push(id);

  const { rows } = await client.query(
    `UPDATE operational_goals
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING ${GOAL_COLUMNS}`,
    params
  );

  return rows[0] ?? null;
};

export const archiveGoal = async (id, archivedBy, client = pool) => {
  void archivedBy;

  const { rows } = await client.query(
    `UPDATE operational_goals
        SET goal_state = 'ARCHIVED', archived_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING ${GOAL_COLUMNS}`,
    [id]
  );

  return rows[0] ?? null;
};

export const restoreGoal = async (id, client = pool) => {
  const { rows } = await client.query(
    `UPDATE operational_goals
        SET goal_state = 'ACTIVE', archived_at = NULL, updated_at = NOW()
      WHERE id = $1
      RETURNING ${GOAL_COLUMNS}`,
    [id]
  );

  return rows[0] ?? null;
};

export const goalExists = async (id, client = pool) => {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM operational_goals
        WHERE id = $1
     ) AS exists`,
    [id]
  );

  return Boolean(rows[0]?.exists);
};

export default {
  createGoal,
  getGoalById,
  listGoals,
  updateGoal,
  archiveGoal,
  restoreGoal,
  goalExists,
};


