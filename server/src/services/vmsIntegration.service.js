// server/src/services/vmsIntegration.service.js
//
// Thin technical boundary to the external VMS.
// Calls the configured adapter. No repositories, transactions, sync
// persistence, HTTP routing, or RBAC live here.
import { getVMSAdapter } from '../integrations/vms.adapter.js';

let adapter = getVMSAdapter();

// Test seam: swap the transport without touching callers.
const setAdapter = (nextAdapter) => {
  if (
    !nextAdapter
    || (typeof nextAdapter.publishEvent !== 'function' && typeof nextAdapter.publishEventBooking !== 'function')
  ) {
    throw new Error('VMS adapter must expose publishEvent(event) or publishEventBooking(data).');
  }
  adapter = nextAdapter;
};

const getAdapter = () => adapter;

const publishEvent = async (event) => {
  if (typeof adapter.publishEvent === 'function') return adapter.publishEvent(event);
  return adapter.publishEventBooking(event);
};

const publishEventBooking = async (data) => {
  if (typeof adapter.publishEventBooking === 'function') return adapter.publishEventBooking(data);
  return adapter.publishEvent(data);
};

const updateTimeslotCapacity = async (externalTimeslotId, capacity) => {
  if (typeof adapter.updateTimeslotCapacity !== 'function') {
    throw new Error('VMS adapter must expose updateTimeslotCapacity(externalTimeslotId, capacity).');
  }
  return adapter.updateTimeslotCapacity(externalTimeslotId, capacity);
};

const getEventBookings = async (externalEventId) => {
  if (typeof adapter.getEventBookings !== 'function') {
    throw new Error('VMS adapter must expose getEventBookings(externalEventId).');
  }
  return adapter.getEventBookings(externalEventId);
};

const sendAttendance = async (attendance) => {
  if (typeof adapter.sendAttendance !== 'function') {
    throw new Error('VMS adapter must expose sendAttendance(attendance).');
  }
  return adapter.sendAttendance(attendance);
};

export default {
  publishEvent,
  publishEventBooking,
  getEventBookings,
  updateTimeslotCapacity,
  sendAttendance,
  setAdapter,
  getAdapter,
};

export { publishEvent, publishEventBooking, getEventBookings, updateTimeslotCapacity, sendAttendance, setAdapter, getAdapter };
