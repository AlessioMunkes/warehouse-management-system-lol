CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS operational_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  goal_text TEXT NOT NULL CHECK (btrim(goal_text) <> ''),

  metric_id TEXT NOT NULL CHECK (btrim(metric_id) <> ''),
  metric_filters JSONB,

  goal_type TEXT NOT NULL CHECK (goal_type IN ('DIRECTIONAL', 'TARGET')),
  direction TEXT NOT NULL CHECK (direction IN ('INCREASE', 'DECREASE', 'MAINTAIN')),

  target_value NUMERIC,

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  comparison_type TEXT NOT NULL CHECK (comparison_type IN ('TARGET', 'PREVIOUS_PERIOD')),

  goal_state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (goal_state IN ('ACTIVE', 'ARCHIVED')),

  created_by INTEGER REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,

  CONSTRAINT operational_goals_period_check
    CHECK (period_start <= period_end),
  CONSTRAINT operational_goals_metric_filters_object_check
    CHECK (metric_filters IS NULL OR jsonb_typeof(metric_filters) = 'object'),
  CONSTRAINT operational_goals_target_value_check
    CHECK (goal_type <> 'TARGET' OR target_value IS NOT NULL),
  CONSTRAINT operational_goals_archive_state_check
    CHECK (
      (goal_state = 'ACTIVE' AND archived_at IS NULL)
      OR
      (goal_state = 'ARCHIVED' AND archived_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_operational_goals_goal_state
  ON operational_goals(goal_state);

CREATE INDEX IF NOT EXISTS idx_operational_goals_metric_id
  ON operational_goals(metric_id);

CREATE INDEX IF NOT EXISTS idx_operational_goals_created_by
  ON operational_goals(created_by);

CREATE INDEX IF NOT EXISTS idx_operational_goals_period
  ON operational_goals(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_operational_goals_active
  ON operational_goals(period_end, created_at)
  WHERE goal_state = 'ACTIVE';
