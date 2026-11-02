-- ─────────────────────────────────────────────────────────────
-- 068_kitchens.sql
--
-- Soup kitchens and Dignity Kitchens as beneficiaries, with the adults
-- each one feeds.
--
-- A kitchen's pallet has always been raised by hand, the kitchen named
-- on the slip (picking_slips.beneficiary_kind and beneficiary_name), and
-- there was nowhere to keep the kitchen itself. Adults served was an
-- estimate from the kilograms sent to soup kitchens. The sponsor counts
-- it as meals: each kitchen feeds a known number of adults per
-- collection, one meal each, at soup kitchens and Dignity Kitchens
-- alike.
--
-- A kitchen is registered here with how many adults it feeds per
-- collection. Its pallets are matched to it by kind and name, the way
-- every slip already names it, so the slips already on record count as
-- soon as their kitchen is registered. Adults served is then the sum,
-- over the kitchen pallets collected in the period, of their kitchen's
-- adults.
--
-- Kept apart from ecd_centres on purpose: that table is the weekly
-- rotation (slip generation, collection reminders, child counts, the
-- impact map), and a kitchen is on none of them.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kitchens (
  id            serial PRIMARY KEY,
  kind          beneficiary_type NOT NULL CHECK (kind IN ('soup_kitchen', 'dignity_kitchen')),
  name          varchar(120) NOT NULL CHECK (btrim(name) <> ''),
  adult_count   integer CHECK (adult_count IS NULL OR adult_count >= 0),
  contact_name  varchar(120),
  contact_phone varchar(40),
  address       text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One kitchen per kind and name: what its pallets are matched on.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchens_kind_name ON kitchens (kind, lower(name));
