// ─────────────────────────────────────────────────────────────
// client/src/services/calendarAPI.js
//
// The operating calendar (server: features/calendar): which weekday
// each cohort collects on, and the days the warehouse is shut.
// ─────────────────────────────────────────────────────────────
import { apiDelete, apiGet, apiPost, apiPut } from './api';

/** { cohorts: { tuesday: 2, thursday: 4 }, closures: [{ id, date, kind, label }] } */
export const getCalendar = async () => (await apiGet('/api/calendar')).data ?? { cohorts: {}, closures: [] };

export const setCohortDays = async (days) => (await apiPut('/api/calendar/cohorts', days)).data;

/** { date, endDate?, kind, label } → { created, alreadyClosed } */
export const addClosure = async (closure) => (await apiPost('/api/calendar/closures', closure)).data;

export const removeClosure = async (id) => (await apiDelete(`/api/calendar/closures/${id}`)).data;

/** → { created, alreadyClosed } */
export const addPublicHolidays = async (year) => (await apiPost('/api/calendar/public-holidays', { year })).data;

export default { getCalendar, setCohortDays, addClosure, removeClosure, addPublicHolidays };
