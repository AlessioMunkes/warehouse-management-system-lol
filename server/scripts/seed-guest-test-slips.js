// ─────────────────────────────────────────────────────────────
// server/scripts/seed-guest-test-slips.js
//
// Seeds picking slips dated TODAY so there is something to walk a guest
// through. Every slip in the database is dated 2026-08-12 to 2026-09-10,
// so the packing board is empty on any current date and the guest flow
// has nothing to open.
//
// This is TEST DATA, not a migration. It does not live in
// server/database/migrations/, takes no number, and touches neither
// schema_migrations nor schema_migration_provenance. It changes rows,
// never the schema — no CREATE, no ALTER, no DROP.
//
// It calls the real generation path (pickingService.generateSlips), the
// same one the manager's "Generate slips" button uses. Nothing here
// writes SQL of its own, so the slips, their items, their picking_events
// and the generated notification are all produced exactly as production
// produces them. Seed data that took a shortcut would not be a rehearsal
// of anything.
//
// RE-RUNNABLE. The repository inserts with
//   ON CONFLICT (ecd_id, dispatch_date) DO NOTHING
// so a second run creates nothing and reports 0 created. Safe to run
// twice; safe to run after a partial failure.
//
// Usage, from the repo root:
//   node server/scripts/seed-guest-test-slips.js
//   node server/scripts/seed-guest-test-slips.js --date=2026-09-16
//   node server/scripts/seed-guest-test-slips.js --dry-run
//
// Reads DATABASE_URL from server/.env, like the other scripts here.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import pool           from '../src/config/db.js';
import pickingService from '../src/services/picking.service.js';
import pickingRepo    from '../src/repositories/picking.repository.js';

const args   = process.argv.slice(2);
const flag   = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const dryRun = args.includes('--dry-run');

// SAST, not UTC. Render runs in UTC and Cape Town is UTC+2, so between
// midnight and 02:00 SAST the server's "today" is still yesterday — and
// a slip seeded for the wrong day is invisible on the board you are
// testing against. en-CA gives YYYY-MM-DD.
const todayInSAST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

const dispatchDate = flag('date') ?? todayInSAST();

// generateSlips takes generated_by from the acting user and writes it to
// picking_slips.generated_by, which is an FK to users. It also refuses
// anyone who is not a manager, so this has to be a real manager row
// rather than a synthetic id.
const findManager = async () => {
  const { rows } = await pool.query(
    `SELECT id, username, role
       FROM users
      WHERE role IN ('manager', 'admin')
        AND is_active = TRUE
      ORDER BY CASE role WHEN 'manager' THEN 0 ELSE 1 END, id
      LIMIT 1`,
  );
  if (!rows[0]) {
    throw new Error('No active manager or admin to generate slips as.');
  }
  return rows[0];
};

// Which cohort is scheduled for this date is decided by
// picking_settings.cohort_anchor_monday, and picking.service refuses a
// bulk run for the wrong one. The resolver is private to that module, so
// rather than duplicating the arithmetic here — two copies of a rotation
// rule is how they drift — ask the service and let it answer.
//
// This is safe to attempt: validateDispatchDate runs before any write,
// so a rejected cohort inserts nothing.
const generateForActiveCohort = async (manager) => {
  const attempts = [];

  for (const cohort of ['week1', 'week2']) {
    try {
      const result = await pickingService.generateSlips({ dispatchDate, cohort }, manager);
      return { cohort, result };
    } catch (err) {
      attempts.push(`${cohort}: ${err.message}`);
      // Only a rotation mismatch is worth trying the other cohort for.
      // A bad date, or a database failure, means stop.
      if (!/not the scheduled rotation/i.test(err.message ?? '')) throw err;
    }
  }

  throw new Error(`Neither cohort was accepted for ${dispatchDate}.\n  ${attempts.join('\n  ')}`);
};

const main = async () => {
  console.log(`\nSeeding picking slips for ${dispatchDate} (SAST)`);

  const manager = await findManager();
  console.log(`Acting as ${manager.username} (${manager.role}, id ${manager.id})`);

  const anchor = await pickingRepo.getCohortAnchor();
  console.log(`Cohort anchor: ${anchor ?? 'not set — rotation check will be skipped'}`);

  const existing = await pickingRepo.getSlips({ dispatchDate });
  console.log(`Slips already dated ${dispatchDate}: ${existing.length}`);

  if (dryRun) {
    console.log('\n--dry-run: stopping before any write.\n');
    return;
  }

  const { cohort, result } = await generateForActiveCohort(manager);

  const { created } = result;   // pickingRepository.generateSlips → { created, emptySlips }
  console.log(`\nCohort ${cohort}: ${created} slip(s) created.`);

  if (result.emptySlips?.length) {
    // Worth surfacing: a slip with no lines is a pallet with nothing on
    // it, which walks a guest into an empty checklist.
    console.log(
      `${result.emptySlips.length} slip(s) have NO items (the ECD has no current order lines):`,
    );
    for (const s of result.emptySlips) console.log(`  slip ${s.slipId} — ecd ${s.ecdId}`);
  }

  const after = await pickingRepo.getSlips({ dispatchDate });
  console.log(`\nSlips now dated ${dispatchDate}: ${after.length}`);
  if (created === 0) {
    console.log('Nothing created — already seeded for this date, or no ECD is in this cohort.');
  }
  console.log('');
};

main()
  .catch((err) => {
    console.error(`\nSeed failed: ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
