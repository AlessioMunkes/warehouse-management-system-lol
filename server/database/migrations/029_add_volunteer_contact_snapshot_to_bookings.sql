ALTER TABLE public.volunteer_bookings
  ADD COLUMN IF NOT EXISTS volunteer_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS volunteer_phone VARCHAR(50);
