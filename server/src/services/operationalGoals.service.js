// server/src/services/operationalGoals.service.js
//
// Business rules for Operational Goals CRUD and live progress measurement.
// AI explanation, HTTP handling, and SQL stay out of this layer.
import operationalGoalsRepo from '../repositories/operationalGoals.repository.js';
import beneficiaryRepo from '../repositories/beneficiary.repository.js';
import dispatchRepo from '../repositories/dispatch.repository.js';
import stockRepo from '../repositories/stock.repository.js';
import decantingRepo from '../repositories/decanting.repository.js';
import loveActivismEventRepo from '../repositories/loveActivismEvent.repository.js';
import eventTimeslotRepo from '../repositories/eventTimeslot.repository.js';
import volunteerBookingRepo from '../repositories/volunteerBooking.repository.js';
import attendanceRepo from '../repositories/attendance.repository.js';
import collectionKitRepo from '../repositories/collectionKit.repository.js';
import donationRepo from '../repositories/donation.repository.js';
import financeRepo from '../repositories/finance.repository.js';
import communityRequestRepo from '../repositories/communityRequest.repository.js';
import {
  GOAL_METRIC_COMPARISON_TYPES,
  GOAL_METRIC_DIRECTIONS,
  GOAL_METRIC_GOAL_TYPES,
  validateMetric,
} from '../config/goalMetricRegistry.js';
import { isValidDateString, isUuid } from '../utils/validation.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const REQUIRED_CREATE_FIELDS = [
  'title',
  'goal_text',
  'metric_id',
  'goal_type',
  'direction',
  'period_start',
  'period_end',
  'comparison_type',
  'created_by',
];

const MUTABLE_FIELDS = [
  'title',
  'goal_text',
  'metric_id',
  'metric_filters',
  'goal_type',
  'direction',
  'target_value',
  'period_start',
  'period_end',
  'comparison_type',
];

const IMMUTABLE_FIELDS = [
  'id',
  'created_by',
  'created_at',
  'updated_at',
  'archived_at',
  'goal_state',
];

const GOAL_STATES = ['ACTIVE', 'ARCHIVED'];
const SORTS = ['created_at_desc', 'period_end_asc'];

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const clean = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const requireObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, `${label} is required.`);
  return value;
};

const requireText = (value, label) => {
  const cleaned = clean(value);
  if (!cleaned) fail(400, `${label} is required.`);
  return cleaned;
};

const validateDate = (value, label) => {
  if (!isValidDateString(value)) fail(400, `${label} must be a valid date (YYYY-MM-DD).`);
  return value;
};

const validatePeriod = (periodStart, periodEnd) => {
  const start = validateDate(periodStart, 'period_start');
  const end = validateDate(periodEnd, 'period_end');
  if (start > end) fail(400, 'period_start must be on or before period_end.');
  return { period_start: start, period_end: end };
};

const validateTargetValue = (value, goalType) => {
  if (value === null || value === undefined || value === '') {
    if (goalType === GOAL_METRIC_GOAL_TYPES.TARGET) fail(400, 'target_value is required for TARGET goals.');
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) fail(400, 'target_value must be a valid number.');
  return numeric;
};

const validateMetricFilters = (metric, filters) => {
  if (filters === undefined || filters === null) return null;
  if (typeof filters !== 'object' || Array.isArray(filters)) fail(400, 'metric_filters must be an object.');

  const supported = new Set(metric.supportedFilters || []);
  const unsupported = Object.keys(filters).filter((key) => !supported.has(key));
  if (unsupported.length > 0) {
    fail(400, `Unsupported metric_filters for ${metric.id}: ${unsupported.join(', ')}.`);
  }

  return filters;
};

const validateGoalType = (metric, goalType) => {
  if (!Object.values(GOAL_METRIC_GOAL_TYPES).includes(goalType)) {
    fail(400, `goal_type must be one of: ${Object.values(GOAL_METRIC_GOAL_TYPES).join(', ')}.`);
  }
  if (!metric.supportedGoalTypes.includes(goalType)) {
    fail(400, `${metric.id} does not support ${goalType} goals.`);
  }
  return goalType;
};

const validateDirection = (metric, direction) => {
  if (!Object.values(GOAL_METRIC_DIRECTIONS).includes(direction)) {
    fail(400, `direction must be one of: ${Object.values(GOAL_METRIC_DIRECTIONS).join(', ')}.`);
  }
  if (!metric.supportedDirections.includes(direction)) {
    fail(400, `${metric.id} does not support ${direction} direction.`);
  }
  return direction;
};

const supportedComparisonTypesForMetric = (metric) => {
  const supported = [GOAL_METRIC_COMPARISON_TYPES.TARGET];
  if (metric.comparisonType) supported.push(metric.comparisonType);
  return supported;
};

const validateComparisonType = (metric, comparisonType) => {
  const allComparisonTypes = Object.values(GOAL_METRIC_COMPARISON_TYPES);
  if (!allComparisonTypes.includes(comparisonType)) {
    fail(400, `comparison_type must be one of: ${allComparisonTypes.join(', ')}.`);
  }

  const supported = supportedComparisonTypesForMetric(metric);
  if (!supported.includes(comparisonType)) {
    fail(400, `${metric.id} does not support ${comparisonType} comparison.`);
  }

  return comparisonType;
};

const normalizeCreatePayload = (body = {}) => {
  const payload = requireObject(body, 'Goal payload');
  for (const field of REQUIRED_CREATE_FIELDS) {
    if (!hasOwn(payload, field) || payload[field] === null || payload[field] === undefined || payload[field] === '') {
      fail(400, `${field} is required.`);
    }
  }

  const metric = validateMetric(payload.metric_id);
  const goalType = validateGoalType(metric, payload.goal_type);
  const period = validatePeriod(payload.period_start, payload.period_end);

  return {
    title: requireText(payload.title, 'title'),
    goal_text: requireText(payload.goal_text, 'goal_text'),
    metric_id: metric.id,
    metric_filters: validateMetricFilters(metric, payload.metric_filters),
    goal_type: goalType,
    direction: validateDirection(metric, payload.direction),
    target_value: validateTargetValue(payload.target_value, goalType),
    ...period,
    comparison_type: validateComparisonType(metric, payload.comparison_type),
    created_by: payload.created_by,
  };
};

const normalizeUpdatePayload = (existing, updates = {}) => {
  const body = requireObject(updates, 'Goal updates');

  for (const field of IMMUTABLE_FIELDS) {
    if (hasOwn(body, field)) fail(400, `${field} cannot be changed.`);
  }

  const patch = {};
  for (const field of MUTABLE_FIELDS) {
    if (hasOwn(body, field)) patch[field] = body[field];
  }

  if (Object.keys(patch).length === 0) fail(400, 'No changes were supplied.');

  const merged = { ...existing, ...patch };
  const metric = validateMetric(merged.metric_id);
  const goalType = validateGoalType(metric, merged.goal_type);
  validateDirection(metric, merged.direction);
  validateComparisonType(metric, merged.comparison_type);
  const period = validatePeriod(merged.period_start, merged.period_end);
  const targetValue = validateTargetValue(merged.target_value, goalType);
  validateMetricFilters(metric, merged.metric_filters);

  if (hasOwn(patch, 'title')) patch.title = requireText(patch.title, 'title');
  if (hasOwn(patch, 'goal_text')) patch.goal_text = requireText(patch.goal_text, 'goal_text');
  if (hasOwn(patch, 'metric_id')) patch.metric_id = metric.id;
  if (hasOwn(patch, 'metric_filters')) patch.metric_filters = validateMetricFilters(metric, patch.metric_filters);
  if (hasOwn(patch, 'goal_type')) patch.goal_type = goalType;
  if (hasOwn(patch, 'direction')) patch.direction = merged.direction;
  if (hasOwn(patch, 'comparison_type')) patch.comparison_type = merged.comparison_type;
  if (hasOwn(patch, 'period_start')) patch.period_start = period.period_start;
  if (hasOwn(patch, 'period_end')) patch.period_end = period.period_end;
  if (hasOwn(patch, 'target_value')) patch.target_value = targetValue;

  return patch;
};

const requireGoalId = (id) => {
  if (!isUuid(id)) fail(400, 'A valid goal ID is required.');
  return id;
};

const READY_METRIC_IDS = new Set([
  'ecd_active_centres',
  'ecd_children_supported',
  'ecd_non_collections',
  'ecd_late_collections',
  'dispatch_volume',
  'stock_variance',
  'low_stock_items',
  'decanting_wastage',
  'volunteer_bookings',
  'volunteer_attendance',
  'compost_kits_issued',
  'compost_logged',
  'compost_dispatched',
  'compost_kg_dispatched',
  'donation_count',
  'donation_value',
  'community_requests_fulfilled',
  'community_response_time',
]);

const dateOnly = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const dateTimeMs = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
};

const inPeriod = (value, period) => {
  const day = dateOnly(value);
  return Boolean(day && day >= period.start && day <= period.end);
};

const previousPeriodFor = ({ start, end }) => {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  const days = Math.round((endDate - startDate) / 86400000) + 1;
  const previousEnd = new Date(startDate);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  return {
    start: previousStart.toISOString().slice(0, 10),
    end: previousEnd.toISOString().slice(0, 10),
  };
};

const numberValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const sumBy = (rows, selector) =>
  rows.reduce((total, row) => total + numberValue(selector(row)), 0);

const applyFilters = (rows, filters = {}) => {
  if (!filters || Object.keys(filters).length === 0) return rows;

  return rows.filter((row) =>
    Object.entries(filters).every(([key, expected]) => {
      if (expected === null || expected === undefined || expected === '') return true;
      const actual = row[key] ?? row[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)];
      if (Array.isArray(expected)) return expected.map(String).includes(String(actual));
      return String(actual) === String(expected);
    })
  );
};

const ecdRows = async (period, filters) => {
  const rows = await beneficiaryRepo.listBeneficiaries({ includeInactive: true });
  return applyFilters(rows, filters).filter((row) => {
    if (!period) return true;
    const createdAt = row.created_at ?? row.approved_at ?? null;
    return !createdAt || inPeriod(createdAt, period);
  });
};

const dispatchRows = async (period, filters) =>
  applyFilters(await dispatchRepo.getHistory('all'), filters)
    .filter((row) => inPeriod(row.dispatch_date, period));

const decantingRows = async (period, filters) =>
  applyFilters(await decantingRepo.getDecantingRecords('all'), filters)
    .filter((row) => inPeriod(row.created_at ?? row.week_of, period));

const loveActivismTimeslots = async (period, filters) => {
  const events = await loveActivismEventRepo.findAll({});
  const rows = [];

  for (const event of events) {
    const timeslots = await eventTimeslotRepo.findByEventId(event.event_id);
    for (const timeslot of timeslots) {
      rows.push({
        ...timeslot,
        event,
        eventType: event.status,
        eventId: event.event_id,
      });
    }
  }

  return applyFilters(rows, filters)
    .filter((row) => inPeriod(row.start_time ?? row.event?.event_date, period));
};

const volunteerBookingsForPeriod = async (period, filters) => {
  const timeslots = await loveActivismTimeslots(period, filters);
  const rows = [];

  for (const timeslot of timeslots) {
    const bookings = await volunteerBookingRepo.findByTimeslotId(timeslot.timeslot_id);
    for (const booking of bookings) rows.push({ ...booking, timeslot });
  }

  return rows;
};

const volunteerAttendanceForPeriod = async (period, filters) => {
  const bookings = await volunteerBookingsForPeriod(period, filters);
  const rows = [];

  for (const booking of bookings) {
    const attendance = await attendanceRepo.findByBookingId(booking.booking_id);
    if (attendance) rows.push({ ...attendance, booking });
  }

  return rows;
};

const collectionKitRecords = async (period, filters) =>
  applyFilters(await collectionKitRepo.listRecords({ limit: 100000 }), filters)
    .filter((row) => inPeriod(row.logged_at ?? row.dispatched_at, period));

const donationRows = async (period, filters) =>
  applyFilters(await donationRepo.listDonations('all'), filters)
    .filter((row) => inPeriod(row.received_at ?? row.created_at, period));

const communityRows = async (period, filters) =>
  applyFilters(await communityRequestRepo.listRequests({}), filters)
    .filter((row) => inPeriod(row.requested_at ?? row.created_at, period));

const MEASUREMENT_HANDLERS = {
  'ecd.activeCentres': async (period, filters) =>
    (await ecdRows(null, filters)).filter((row) => row.is_active === true).length,

  'ecd.childrenSupported': async (period, filters) =>
    sumBy((await ecdRows(null, filters)).filter((row) => row.is_active === true), (row) => row.child_count),

  'ecd.nonCollections': async (period, filters) =>
    (await dispatchRows(period, filters)).filter((row) => row.status === 'not_collected').length,

  'ecd.lateCollections': async (period, filters) =>
    (await dispatchRows(period, filters)).filter((row) => row.status === 'late_collected').length,

  'warehouse.dispatchVolume': async (period, filters) =>
    (await dispatchRows(period, filters)).filter((row) => ['collected', 'late_collected'].includes(row.status)).length,

  'warehouse.stockVariance': async (period, filters) =>
    sumBy(applyFilters(await stockRepo.getReconciliation(), filters), (row) => Math.abs(numberValue(row.variance))),

  'warehouse.lowStockItems': async (period, filters) =>
    applyFilters(await stockRepo.getManifest(), filters).filter((row) => row.is_low_stock === true).length,

  'warehouse.decantingWastage': async (period, filters) =>
    sumBy(await decantingRows(period, filters), (row) => row.total_wastage_kg),

  'loveActivism.volunteerBookings': async (period, filters) =>
    (await volunteerBookingsForPeriod(period, filters)).filter((row) => row.booking_status !== 'CANCELLED').length,

  'loveActivism.volunteerAttendance': async (period, filters) =>
    (await volunteerAttendanceForPeriod(period, filters)).filter((row) => row.checked_in === true).length,

  'feedTheSoil.compostKitsIssued': async (period, filters) =>
    applyFilters(await collectionKitRepo.listKits({}), filters)
      .filter((row) => inPeriod(row.assigned_at ?? row.created_at, period)).length,

  'feedTheSoil.compostLogged': async (period, filters) =>
    (await collectionKitRecords(period, filters)).length,

  'feedTheSoil.compostDispatched': async (period, filters) =>
    (await collectionKitRecords(period, filters)).filter((row) => row.status === 'dispatched').length,

  'feedTheSoil.compostKgDispatched': async (period, filters) =>
    sumBy((await collectionKitRecords(period, filters)).filter((row) => row.status === 'dispatched'), (row) => row.kg_compost),

  'donations.count': async (period, filters) =>
    (await donationRows(period, filters)).length,

  'donations.value': async (period, filters) => {
    if (!filters || Object.keys(filters).length === 0) {
      return numberValue(await financeRepo.getDonationValueTotal({ from: period.start, to: period.end }));
    }
    return sumBy(await donationRows(period, filters), (row) => row.estimated_value_zar);
  },

  'community.requestsFulfilled': async (period, filters) =>
    (await communityRows(period, filters)).filter((row) => !['pending', null, undefined].includes(row.outcome)).length,

  'community.responseTime': async (period, filters) => {
    const resolved = (await communityRows(period, filters))
      .filter((row) => row.resolved_at && row.requested_at);
    if (resolved.length === 0) return 0;
    const totalDays = sumBy(resolved, (row) => {
      const requested = dateTimeMs(row.requested_at);
      const resolvedAt = dateTimeMs(row.resolved_at);
      return requested !== null && resolvedAt !== null ? (resolvedAt - requested) / 86400000 : 0;
    });
    return totalDays / resolved.length;
  },
};

const progressPercentFor = (goal, currentValue) => {
  if (goal.goal_type !== GOAL_METRIC_GOAL_TYPES.TARGET) return null;

  const targetValue = numberValue(goal.target_value);
  if (targetValue === 0) return currentValue === 0 ? 100 : 0;

  if (goal.direction === GOAL_METRIC_DIRECTIONS.DECREASE) {
    if (currentValue <= targetValue) return 100;
    return Math.max(0, Math.min(100, (targetValue / currentValue) * 100));
  }

  if (goal.direction === GOAL_METRIC_DIRECTIONS.MAINTAIN) {
    return currentValue === targetValue ? 100 : 0;
  }

  return Math.max(0, Math.min(100, (currentValue / targetValue) * 100));
};

const statusFor = ({ goal, currentValue, previousValue = null }) => {
  if (goal.goal_type === GOAL_METRIC_GOAL_TYPES.TARGET) {
    const targetValue = numberValue(goal.target_value);
    if (goal.direction === GOAL_METRIC_DIRECTIONS.DECREASE) {
      return currentValue <= targetValue ? 'ACHIEVED' : 'IN_PROGRESS';
    }
    if (goal.direction === GOAL_METRIC_DIRECTIONS.MAINTAIN) {
      return currentValue === targetValue ? 'ACHIEVED' : 'IN_PROGRESS';
    }
    return currentValue >= targetValue ? 'ACHIEVED' : 'IN_PROGRESS';
  }

  if (previousValue === null || previousValue === undefined) return 'INSUFFICIENT_DATA';

  if (goal.direction === GOAL_METRIC_DIRECTIONS.INCREASE) {
    if (currentValue > previousValue) return 'ON_TRACK';
    if (currentValue === previousValue) return 'NO_CHANGE';
    return 'OFF_TRACK';
  }

  if (goal.direction === GOAL_METRIC_DIRECTIONS.DECREASE) {
    if (currentValue < previousValue) return 'ON_TRACK';
    if (currentValue === previousValue) return 'NO_CHANGE';
    return 'OFF_TRACK';
  }

  return currentValue === previousValue ? 'ON_TRACK' : 'OFF_TRACK';
};

const createGoal = async (goal) => {
  const payload = normalizeCreatePayload(goal);
  return operationalGoalsRepo.createGoal(payload);
};

const getGoal = async (id) => {
  const goalId = requireGoalId(id);
  const goal = await operationalGoalsRepo.getGoalById(goalId);
  if (!goal) fail(404, 'Operational goal not found.');
  return goal;
};

const listGoals = async (filters = {}) => {
  const query = { ...filters };

  if (!hasOwn(query, 'goal_state')) query.goal_state = 'ACTIVE';
  if (query.goal_state && !GOAL_STATES.includes(query.goal_state)) {
    fail(400, `goal_state must be one of: ${GOAL_STATES.join(', ')}.`);
  }
  if (query.metric_id) validateMetric(query.metric_id);
  if (query.period_start) validateDate(query.period_start, 'period_start');
  if (query.period_end) validateDate(query.period_end, 'period_end');
  if (query.period_start && query.period_end && query.period_start > query.period_end) {
    fail(400, 'period_start must be on or before period_end.');
  }
  if (query.sort && !SORTS.includes(query.sort)) fail(400, `sort must be one of: ${SORTS.join(', ')}.`);

  return operationalGoalsRepo.listGoals(query);
};

const updateGoal = async (id, updates) => {
  const goalId = requireGoalId(id);
  const existing = await operationalGoalsRepo.getGoalById(goalId);
  if (!existing) fail(404, 'Operational goal not found.');

  const patch = normalizeUpdatePayload(existing, updates);
  return operationalGoalsRepo.updateGoal(goalId, patch);
};

const archiveGoal = async (id, archivedBy = null) => {
  const goalId = requireGoalId(id);
  const existing = await operationalGoalsRepo.getGoalById(goalId);
  if (!existing) fail(404, 'Operational goal not found.');
  if (existing.goal_state === 'ARCHIVED') return existing;

  return operationalGoalsRepo.archiveGoal(goalId, archivedBy);
};

const restoreGoal = async (id) => {
  const goalId = requireGoalId(id);
  const existing = await operationalGoalsRepo.getGoalById(goalId);
  if (!existing) fail(404, 'Operational goal not found.');
  if (existing.goal_state === 'ACTIVE') return existing;

  return operationalGoalsRepo.restoreGoal(goalId);
};

const getGoalProgress = async (id) => {
  const goal = await getGoal(id);
  const metric = validateMetric(goal.metric_id);
  const measurementHandler = MEASUREMENT_HANDLERS[metric.measurementKey];

  if (!READY_METRIC_IDS.has(metric.id) || typeof measurementHandler !== 'function') {
    fail(501, `${metric.id} is not supported by the live progress engine yet.`);
  }

  const period = {
    start: dateOnly(goal.period_start),
    end: dateOnly(goal.period_end),
  };
  const filters = goal.metric_filters || {};
  const currentValue = numberValue(await measurementHandler(period, filters));
  let previousValue = null;

  if (goal.comparison_type === GOAL_METRIC_COMPARISON_TYPES.PREVIOUS_PERIOD) {
    previousValue = numberValue(await measurementHandler(previousPeriodFor(period), filters));
  }

  return {
    goalId: goal.id,
    metricId: metric.id,
    currentValue,
    targetValue: goal.target_value === null || goal.target_value === undefined
      ? null
      : numberValue(goal.target_value),
    progressPercent: progressPercentFor(goal, currentValue),
    previousValue,
    status: statusFor({ goal, currentValue, previousValue }),
    measuredAt: new Date().toISOString(),
  };
};

export default {
  createGoal,
  getGoal,
  listGoals,
  updateGoal,
  archiveGoal,
  restoreGoal,
  getGoalProgress,
};

export {
  createGoal,
  getGoal,
  listGoals,
  updateGoal,
  archiveGoal,
  restoreGoal,
  getGoalProgress,
};

