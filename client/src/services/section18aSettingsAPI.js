// Frontend API service for Certificate Settings.
// Single-row settings table (id = 1). GET returns current settings, PUT updates them.
// Uses the dedicated /api/certificate-settings endpoints through the shared API client.

import { apiGet, apiPost, apiPut } from './api';

export const getSettings = async () => {
  const body = await apiGet('/api/certificate-settings');
  return body.data || null;
};

export const saveSettings = async (settings) => {
  try {
    const body = await apiPut('/api/certificate-settings', settings);
    return body.data || null;
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  const body = await apiPost('/api/certificate-settings', settings);
  return body.data || null;
};

export const updateSettings = async (settings) => saveSettings(settings);

export const createSettings = async (settings) => {
  const body = await apiPost('/api/certificate-settings', settings);
  return body.data || null;
};

export const deleteSettings = async () => {
  const response = await fetch('/api/certificate-settings', {
    method: 'DELETE',
    credentials: 'include',
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    const error = new Error(body.message || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  return body.data || null;
};

export default {
  getSettings,
  saveSettings,
  updateSettings,
  createSettings,
  deleteSettings,
};
