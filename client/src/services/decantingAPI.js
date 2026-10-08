// src/services/decanting.api.js
//
// Every endpoint here is confirmed against the real
// decanting.controller.js — all wrap responses as { success, data },
// so every function below unwraps .data before returning.
import { apiGet, apiPost, cachedGet } from './api';
import { postOrQueue } from './offlinePost';

// NOTE: decanting.controller.js has getDecantableProducts fully
// commented out (route, controller, and service). Reusing
// procurement's existing products endpoint as a stopgap until
// that's uncommented on the backend — not something to fix here.
//
// Cached the same way receivingAPI.js caches suppliers: this is a
// fresh route mount every visit to Decanting, and the product list
// barely changes minute to minute, so without this every visit re-
// paid the round trip before either view mode had anything to show.
export const getProducts = async () =>
  cachedGet('decanting:products', 60_000, async () => {
    const res = await apiGet('/api/deliveries/products');
    return res.data;
  });

export const calculateDecantingPlan = async (data) => {
  const res = await apiPost('/api/decanting/calculate', data);
  return res.data;
};

// With no signal this returns { queued: true, label } instead of the
// sheet: it is kept on the phone and sent when the server can be
// reached (offlinePost.js). A sheet cannot be un-recorded, which is why
// it used to fail outright here; the server now recognises a repeat of
// the same submission, so sending it later is safe.
export const recordDecanting = async (data) => {
  const res = await postOrQueue('/api/decanting', data, { kind: 'decanting', label: 'A decanting sheet' });
  return res.queued ? res : res.data;
};

export const getDecantingRecords = async (range = 'all') => {
  const res = await apiGet(`/api/decanting?range=${range}`);
  return res.data;
};

export const getDecantingById = async (id) => {
  const res = await apiGet(`/api/decanting/${id}`);
  return res.data;
};

export const getWeeklyReport = async (weekOf) => {
  const res = await apiGet(`/api/decanting/report?weekOf=${weekOf}`);
  return res.data;
};

// Not a JSON call — this returns a downloadable CSV file. Use as
// a direct link/redirect target, e.g. <a href={exportDecantingSheet(id)}>
export const exportDecantingSheet = (id) => `/api/decanting/${id}/export`;