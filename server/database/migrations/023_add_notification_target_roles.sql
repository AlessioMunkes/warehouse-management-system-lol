ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS target_roles TEXT[];

UPDATE notifications
SET target_roles = CASE
  WHEN type IN ('low_stock', 'picking_slips_generated', 'non_collections_flagged', 'purchase_order_needs_attention')
    THEN ARRAY['manager', 'admin']::TEXT[]
  WHEN type = 'donation_review' OR type LIKE 'section18a%'
    THEN ARRAY['admin']::TEXT[]
  WHEN type IN ('picking_slip_created')
    THEN ARRAY['warehouse_worker', 'manager', 'admin']::TEXT[]
  WHEN type LIKE 'volunteer%' OR type LIKE 'vms%'
    THEN ARRAY['manager', 'admin']::TEXT[]
  ELSE target_roles
END
WHERE target_roles IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_target_roles
ON notifications USING GIN (target_roles);
