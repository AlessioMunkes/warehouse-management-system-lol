BEGIN;

-- Phase 6A blocker fix: allow Phase 4 'event_booking' value while
-- preserving the Phase 1 'EVENT' / 'TIMESLOT' values.
ALTER TABLE public.vms_sync DROP CONSTRAINT chk_vms_sync_entity_type;

ALTER TABLE public.vms_sync ADD CONSTRAINT chk_vms_sync_entity_type
    CHECK (entity_type IN ('EVENT', 'TIMESLOT', 'event_booking'));

INSERT INTO public.schema_migrations (id, applied_at, notes)
VALUES ('016_expand_vms_sync_entity_type', NOW(), 'Volunteer Management Phase 6A: allow event_booking in vms_sync.entity_type (additive, preserves EVENT/TIMESLOT)')
ON CONFLICT (id) DO NOTHING;

COMMIT;
