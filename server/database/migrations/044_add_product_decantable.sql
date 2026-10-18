-- ─────────────────────────────────────────────────────────────
-- 044_add_product_decantable.sql
--
-- Decantable: a product kept loose, by weight or volume, that the team
-- portions out of bulk (maize meal, rice, sugar, oil).
--
-- The flag decides two things:
--   - only a decantable product is offered on the Decanting screen
--   - only a decantable product can have a part quantity anywhere:
--     on a slip, when packing, receiving, dispatching or adjusting
--     stock. Everything else (a can, a crate, a jar) is a whole number.
--
-- Starting point: whatever is measured in kilograms, grams, litres or
-- millilitres is decantable, whatever is counted is not. An admin
-- changes any of them on the Products screen.
--
-- Additive only: one new column.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_decantable BOOLEAN NOT NULL DEFAULT false;

UPDATE products
   SET is_decantable = true
 WHERE default_unit IN ('kg', 'g', 'l', 'ml')
   AND is_decantable = false;
