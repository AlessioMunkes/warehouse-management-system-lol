BEGIN;

CREATE TABLE public.love_activism_events (
    event_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name       VARCHAR(200) NOT NULL,
    description      TEXT,
    event_date       DATE NOT NULL,
    status           VARCHAR(20) NOT NULL,
    created_by       INTEGER NOT NULL REFERENCES public.users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_love_activism_events_status
        CHECK (status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX idx_love_activism_events_event_date
    ON public.love_activism_events (event_date);

CREATE INDEX idx_love_activism_events_status
    ON public.love_activism_events (status);

CREATE TABLE public.event_spaces (
    space_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_name       VARCHAR(200) NOT NULL,
    description      TEXT,
    location         VARCHAR(255),
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_event_spaces_space_name
        UNIQUE (space_name)
);

CREATE TABLE public.event_timeslots (
    timeslot_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id         UUID NOT NULL REFERENCES public.love_activism_events(event_id),
    space_id         UUID NOT NULL REFERENCES public.event_spaces(space_id),
    start_time       TIMESTAMPTZ NOT NULL,
    end_time         TIMESTAMPTZ NOT NULL,
    capacity         INTEGER NOT NULL,
    status           VARCHAR(20) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_event_timeslots_capacity
        CHECK (capacity > 0),

    CONSTRAINT chk_event_timeslots_end_after_start
        CHECK (end_time > start_time),

    CONSTRAINT chk_event_timeslots_status
        CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),

    CONSTRAINT uq_event_timeslots_unique_slot
        UNIQUE (event_id, space_id, start_time, end_time)
);

CREATE INDEX idx_event_timeslots_event_id
    ON public.event_timeslots (event_id);

CREATE INDEX idx_event_timeslots_space_id
    ON public.event_timeslots (space_id);

CREATE INDEX idx_event_timeslots_start_time
    ON public.event_timeslots (start_time);

CREATE TABLE public.volunteer_bookings (
    booking_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timeslot_id          UUID NOT NULL REFERENCES public.event_timeslots(timeslot_id),
    external_booking_id  VARCHAR(255),
    external_volunteer_id VARCHAR(255),
    volunteer_first_name VARCHAR(100) NOT NULL,
    volunteer_last_name  VARCHAR(100),
    booking_source       VARCHAR(20) NOT NULL,
    booking_status       VARCHAR(20) NOT NULL,
    booked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_synced_at       TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_volunteer_bookings_source
        CHECK (booking_source IN ('VMS', 'WMS_GUEST')),

    CONSTRAINT chk_volunteer_bookings_status
        CHECK (booking_status IN ('CONFIRMED', 'CANCELLED')),

    CONSTRAINT chk_volunteer_bookings_external_ids
        CHECK (
            booking_source <> 'VMS'
            OR (
                external_booking_id IS NOT NULL
                AND external_volunteer_id IS NOT NULL
            )
        ),

    CONSTRAINT uq_volunteer_bookings_external_booking_id
        UNIQUE (external_booking_id)
);

CREATE INDEX idx_volunteer_bookings_timeslot_id
    ON public.volunteer_bookings (timeslot_id);

CREATE INDEX idx_volunteer_bookings_external_volunteer_id
    ON public.volunteer_bookings (external_volunteer_id);

CREATE INDEX idx_volunteer_bookings_booking_status
    ON public.volunteer_bookings (booking_status);

CREATE TABLE public.attendance (
    attendance_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id       UUID NOT NULL REFERENCES public.volunteer_bookings(booking_id),
    checked_in       BOOLEAN NOT NULL DEFAULT FALSE,
    check_in_time    TIMESTAMPTZ,
    source           VARCHAR(50),
    last_synced_at   TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_attendance_booking
        UNIQUE (booking_id),

    CONSTRAINT chk_attendance_check_in_consistency
        CHECK (
            (checked_in = FALSE AND check_in_time IS NULL) OR
            (checked_in = TRUE  AND check_in_time IS NOT NULL)
        )
);

CREATE INDEX idx_attendance_booking_id
    ON public.attendance (booking_id);

CREATE INDEX idx_attendance_checked_in
    ON public.attendance (checked_in);

CREATE TABLE public.vms_sync (
    sync_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type      VARCHAR(20) NOT NULL,
    entity_id        UUID NOT NULL,
    external_id      VARCHAR(255),
    sync_status      VARCHAR(20) NOT NULL,
    last_attempt_at  TIMESTAMPTZ,
    last_success_at  TIMESTAMPTZ,
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_vms_sync_entity_type
        CHECK (entity_type IN ('EVENT', 'TIMESLOT')),

    CONSTRAINT chk_vms_sync_status
        CHECK (sync_status IN ('PENDING', 'SYNCED', 'FAILED')),

    CONSTRAINT uq_vms_sync_entity
        UNIQUE (entity_type, entity_id)
);

CREATE INDEX idx_vms_sync_sync_status
    ON public.vms_sync (sync_status);

CREATE INDEX idx_vms_sync_external_id
    ON public.vms_sync (external_id);

INSERT INTO public.schema_migrations (id, applied_at, notes)
VALUES ('015_create_volunteer_management_tables', NOW(), 'Volunteer Management Phase 1: six tables')
ON CONFLICT (id) DO NOTHING;

COMMIT;
