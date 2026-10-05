ALTER TABLE decanting_lines
  ADD COLUMN IF NOT EXISTS partial_bag_actual_kg NUMERIC(10,3);

ALTER TABLE decanting_lines
  ADD CONSTRAINT decanting_lines_partial_bag_actual_kg_check
  CHECK (
    partial_bag_actual_kg IS NULL
    OR (
      partial_bag_actual_kg > 0
      AND partial_bag_actual_kg < 0.5
    )
  );
