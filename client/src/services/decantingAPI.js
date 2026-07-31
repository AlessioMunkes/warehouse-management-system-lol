// src/services/decanting.api.js
//
// Every endpoint here is confirmed against the real
// decanting.controller.js — all wrap responses as { success, data },
// so every function below unwraps .data before returning.
import { apiGet, apiPost } from './api';

// NOTE: decanting.controller.js has getDecantableProducts fully
// commented out (route, controller, and service). Reusing
// procurement's existing products endpoint as a stopgap until
// that's uncommented on the backend — not something to fix here.
export const getProducts = async () => {
  const res = await apiGet('/api/deliveries/products');
  return res.data;
};

export const calculateDecantingPlan = async (data) => {
  const res = await apiPost('/api/decanting/calculate', data);
  return res.data;
};

export const recordDecanting = async (data) => {
  const res = await apiPost('/api/decanting', data);
  return res.data;
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