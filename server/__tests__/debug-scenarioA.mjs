// THROWAWAY DEBUG SCRIPT — delete after use.
// Traces the Scenario A flow step-by-step to find where the hang is.
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.VOLUNTEER_TEST_DATABASE_URL, ssl: false });

const step = async (label, fn, ms = 4000) => {
  const t = setTimeout(() => { console.log(`HANG at: ${label}`); process.exit(2); }, ms);
  try { const r = await fn(); console.log(`OK: ${label}`); clearTimeout(t); return r; }
  catch (e) { console.log(`ERR: ${label} -> ${e.message}`); clearTimeout(t); throw e; }
};

const main = async () => {
  await step('connect', () => pool.query('SELECT 1'));
  const eventId = await step('insert event', async () => {
    const r = await pool.query(
      `INSERT INTO public.love_activism_events (event_name, event_date, status, created_by)
       VALUES ('dbg', '2026-09-10', 'DRAFT', 1) RETURNING event_id`);
    return r.rows[0].event_id;
  });
  await step('queueSync PENDING', () =>
    pool.query(`INSERT INTO public.vms_sync (entity_type, entity_id, sync_status) VALUES ('event_booking', $1, 'PENDING') ON CONFLICT DO NOTHING`, [eventId]));
  await step('select sync row', async () => {
    const r = await pool.query(`SELECT sync_status FROM public.vms_sync WHERE entity_type='event_booking' AND entity_id=$1`, [eventId]);
    console.log('   sync_seen=', r.rows[0]?.sync_status);
  });
  await step('markSynced', () =>
    pool.query(`UPDATE public.vms_sync SET sync_status='SYNCED', external_id=$2, last_success_at=NOW(), updated_at=NOW() WHERE entity_type='event_booking' AND entity_id=$1`, [eventId, `VMS-event_booking-${eventId}`]));
  await step('update event PUBLISHED', () =>
    pool.query(`UPDATE public.love_activism_events SET status='PUBLISHED', updated_at=NOW() WHERE event_id=$1`, [eventId]));
  await step('cleanup', async () => {
    await pool.query(`DELETE FROM public.vms_sync WHERE entity_type='event_booking' AND entity_id=$1`, [eventId]);
    await pool.query(`DELETE FROM public.love_activism_events WHERE event_id=$1`, [eventId]);
  });
  await pool.end();
  console.log('ALL STEPS OK');
};
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
