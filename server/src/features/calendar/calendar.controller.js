// ─────────────────────────────────────────────────────────────
// server/src/features/calendar/calendar.controller.js
// ─────────────────────────────────────────────────────────────
import calendar from './calendar.service.js';

const respond = (res, err, where, fallback) => {
  if (!err.status || err.status >= 500) console.error(`[calendar] ${where}:`, err);
  const status = err.status || 500;
  return res.status(status).json({ success: false, message: status < 500 ? err.message : fallback });
};

const handle = (fn, where, fallback, ok = 200) => async (req, res) => {
  try {
    return res.status(ok).json({ success: true, data: await fn(req) });
  } catch (err) {
    return respond(res, err, where, fallback);
  }
};

export default {
  get: handle((req) => calendar.getCalendar({ from: req.query.from }), 'get', 'Could not load the operating calendar.'),
  setCohortDays: handle((req) => calendar.setCohortDays(req.body, req.user), 'setCohortDays', 'Could not save the collection days.'),
  addClosure: handle((req) => calendar.addClosure(req.body, req.user), 'addClosure', 'Could not add the closed day.', 201),
  removeClosure: handle((req) => calendar.removeClosure(req.params.id), 'removeClosure', 'Could not remove the closed day.'),
  addPublicHolidays: handle((req) => calendar.addPublicHolidays(req.body, req.user), 'addPublicHolidays', 'Could not add the public holidays.', 201),
};
