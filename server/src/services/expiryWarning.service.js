// ─────────────────────────────────────────────────────────────
// server/src/services/expiryWarning.service.js
//
// Orchestrates the expiry-warning sweep: pull delivery lines entering
// each warning window, skip anything already warned about at that
// tier, write one manager notification per line that's new. See
// expiryWarning.repository.js for what "approaching expiry" means
// here and its limits.
//
// Two tiers, run independently — a line inside the 7-day window is
// also inside the 14-day one, and gets both notifications over the
// two weeks (one when it first enters the 14-day window, a second,
// more urgent one when it enters the 7-day window). That is the
// sponsor's own request: "two weeks before expiry, with another
// warning one week before expiry" — two distinct alerts, not one.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import expiryWarningRepository from '../repositories/expiryWarning.repository.js';
import { createNotification } from '../repositories/notification.repository.js';
import settings from './settings.service.js';

// The two windows come from Settings (stock.expiryWarningFirstDays /
// SecondDays), defaulting to 14 and 7. The notification TYPES stay
// fixed whatever the days: warningAlreadySent dedupes on them, and a
// type that changed with the setting would warn about every line
// again the day an admin moved it.
const daysLabel = (days) => (days % 7 === 0
  ? `${days / 7} week${days === 7 ? '' : 's'}`
  : `${days} day${days === 1 ? '' : 's'}`);

const tiers = async () => {
  const all = await settings.getAll();
  const first = all['stock.expiryWarningFirstDays'];
  const second = all['stock.expiryWarningSecondDays'];
  return [
    { days: first,  type: 'stock_expiry_warning_2w', label: daysLabel(first) },
    { days: second, type: 'stock_expiry_warning_1w', label: daysLabel(second) },
  ];
};

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

// One notification, in its own transaction — a failure notifying
// about line B should never roll back the one already written for
// line A, and createNotification requires a client of its own either
// way (see notification.repository.js's own note on why).
const notifyOne = async (item, tier) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await createNotification(client, {
      type: tier.type,
      title: `${item.product_name} expires in ${tier.label}`,
      body: `${item.received_quantity} ${item.unit || ''} · Expires ${formatDate(item.expiry_date)}` +
        (item.sku ? ` · ${item.sku}` : ''),
      entityType: 'delivery_note_item_expiry',
      entityId: item.delivery_note_item_id,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Run the sweep ────────────────────────────────────────────────
// Returns a small summary rather than void, so both the scheduled job
// and a manual trigger (server/src/jobs/expiryWarning.job.js, or a
// future "run now" endpoint) have something to log.
const runExpiryCheck = async () => {
  const summary = { checked: 0, notified: 0 };

  for (const tier of await tiers()) {
    const items = await expiryWarningRepository.findApproachingExpiry(tier.days);
    summary.checked += items.length;

    for (const item of items) {
      const already = await expiryWarningRepository.warningAlreadySent(
        item.delivery_note_item_id, tier.type
      );
      if (already) continue;

      await notifyOne(item, tier);
      summary.notified += 1;
    }
  }

  return summary;
};

export default { runExpiryCheck };
