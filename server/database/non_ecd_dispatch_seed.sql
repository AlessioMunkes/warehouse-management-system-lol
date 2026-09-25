-- ─────────────────────────────────────────────────────────────
-- server/database/non_ecd_dispatch_seed.sql
--
-- Demo dispatch data for soup kitchens, dignity kitchens and
-- community requests — the three beneficiary_kind values that,
-- checked across the entire server codebase (every repository,
-- service and controller), NO code anywhere ever writes. Every
-- picking slip in this app is generated from ecd_centres
-- (picking.repository.js's generateSlips/createSlip, both of which
-- only ever take an ecdId), so beneficiary_kind sits at its column
-- default on every real row that has ever existed. That's why Adults
-- served, the two "Beneficiaries by type" estimates and the new
-- "Meals served" chart all read 0/empty for everything except
-- children — not a reporting bug, a genuine gap in what the app can
-- currently produce, surfaced by reporting features that were built
-- assuming non-ECD dispatches exist somewhere.
--
-- This script does NOT build that missing feature (a real way to log
-- a non-ECD dispatch) — it fabricates demo rows directly so the
-- reporting screens have something real to show before submission.
-- Treat every row this creates as clearly-labelled demo data, not a
-- real dispatch.
--
-- COLUMN SHAPES ARE INFERRED FROM APPLICATION CODE, NOT A SCHEMA
-- DUMP. database.md (this repo's own schema doc) explicitly disclaims
-- itself as a stale Milestone 2 target and does not match the live
-- columns — confirmed by cross-checking it against picking.repository.js
-- and dispatch.repository.js's actual INSERT/UPDATE statements, which
-- this script matches instead. If any INSERT below fails on a column
-- that doesn't exist or a NOT NULL constraint this script didn't
-- know about, nothing partial is left behind — the whole thing runs
-- inside one PL/pgSQL block, which is atomic on its own.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
--   - stock_levels: a real dispatch deducts stock at the gate
--     (dispatch.repository.js's collect()); this script writes
--     picking/dispatch rows directly and skips that deduction, so
--     stock_levels will not reflect these kilograms leaving. Fine for
--     a reporting demo, not fine if you're also testing inventory.
--   - audit_log: these are seed rows, not app-driven changes, same
--     reasoning collection_kits_seed.sql already uses.
--
-- SAFE TO RE-RUN.
-- Skips entirely if any picking_slips row already has beneficiary_kind
-- IN ('soup_kitchen', 'dignity_kitchen', 'community') — running this
-- twice does not double the data.
--
-- REQUIRES at least one row in `users` and one in `products` to exist
-- already; if either is missing it prints a notice and does nothing.
--
-- RUN IT
--   psql "$DATABASE_URL" -f server/database/non_ecd_dispatch_seed.sql
-- Then also run reporting_factors_seed.sql if you haven't — the
-- dignity-kitchen and community-request ESTIMATE cards still need
-- those factors on top of this dispatch data to show a number.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_user_id    INTEGER;
  v_product_id INTEGER;
  v_slip_id    INTEGER;
  v_item_id    INTEGER;
  v_event_id   INTEGER;
  v_month      INTEGER;
  v_date       DATE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM picking_slips
     WHERE beneficiary_kind IN ('soup_kitchen', 'dignity_kitchen', 'community')
  ) THEN
    RAISE NOTICE 'Demo non-ECD dispatch data already present — skipping.';
    RETURN;
  END IF;

  SELECT id INTO v_user_id FROM users ORDER BY id LIMIT 1;
  SELECT id INTO v_product_id FROM products ORDER BY id LIMIT 1;

  IF v_user_id IS NULL OR v_product_id IS NULL THEN
    RAISE NOTICE 'No users or products found — cannot seed demo dispatches.';
    RETURN;
  END IF;

  -- Soup kitchen: one dispatch a month for the last 6 months, so
  -- adults_reached and the "Meals served" grouped-by-month chart both
  -- have a real trend rather than one lump total.
  FOR v_month IN 0..5 LOOP
    v_date := CURRENT_DATE - (v_month || ' months')::interval;

    INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, generated_by, beneficiary_kind, beneficiary_name)
    VALUES (NULL, v_date, 'week1', v_user_id, 'soup_kitchen', 'Demo Soup Kitchen')
    RETURNING id INTO v_slip_id;

    INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit, status, packed_quantity, confirmed_by, confirmed_at)
    VALUES (v_slip_id, v_product_id, 20, 'kg', 'confirmed', 20, v_user_id, NOW())
    RETURNING id INTO v_item_id;

    INSERT INTO dispatch_events (picking_slip_id, status, collected_at, dispatched_by, driver_name)
    VALUES (v_slip_id, 'collected', v_date, v_user_id, 'Demo Driver')
    RETURNING id INTO v_event_id;

    INSERT INTO dispatch_event_lines (dispatch_event_id, picking_slip_item_id, product_id, packed_quantity, loaded_quantity, unit)
    VALUES (v_event_id, v_item_id, v_product_id, 20, 20, 'kg');

    -- Community request: every other month, a smaller quantity —
    -- households, not a whole kitchen.
    IF v_month % 2 = 0 THEN
      INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, generated_by, beneficiary_kind, beneficiary_name)
      VALUES (NULL, v_date, 'week2', v_user_id, 'community', 'Demo Community Request')
      RETURNING id INTO v_slip_id;

      INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit, status, packed_quantity, confirmed_by, confirmed_at)
      VALUES (v_slip_id, v_product_id, 8, 'kg', 'confirmed', 8, v_user_id, NOW())
      RETURNING id INTO v_item_id;

      INSERT INTO dispatch_events (picking_slip_id, status, collected_at, dispatched_by, driver_name)
      VALUES (v_slip_id, 'collected', v_date, v_user_id, 'Demo Driver')
      RETURNING id INTO v_event_id;

      INSERT INTO dispatch_event_lines (dispatch_event_id, picking_slip_item_id, product_id, packed_quantity, loaded_quantity, unit)
      VALUES (v_event_id, v_item_id, v_product_id, 8, 8, 'kg');
    END IF;
  END LOOP;

  -- Dignity kitchen: two months only — it's a single aggregate
  -- estimate on this page, not a trend anyone drills into by month.
  FOR v_month IN 0..1 LOOP
    v_date := CURRENT_DATE - (v_month || ' months')::interval;

    INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, generated_by, beneficiary_kind, beneficiary_name)
    VALUES (NULL, v_date, 'week1', v_user_id, 'dignity_kitchen', 'Demo Dignity Kitchen')
    RETURNING id INTO v_slip_id;

    INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit, status, packed_quantity, confirmed_by, confirmed_at)
    VALUES (v_slip_id, v_product_id, 15, 'kg', 'confirmed', 15, v_user_id, NOW())
    RETURNING id INTO v_item_id;

    INSERT INTO dispatch_events (picking_slip_id, status, collected_at, dispatched_by, driver_name)
    VALUES (v_slip_id, 'collected', v_date, v_user_id, 'Demo Driver')
    RETURNING id INTO v_event_id;

    INSERT INTO dispatch_event_lines (dispatch_event_id, picking_slip_item_id, product_id, packed_quantity, loaded_quantity, unit)
    VALUES (v_event_id, v_item_id, v_product_id, 15, 15, 'kg');
  END LOOP;

  RAISE NOTICE 'Seeded demo soup-kitchen, dignity-kitchen and community-request dispatches.';
END $$;
