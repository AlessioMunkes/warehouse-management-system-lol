// ─────────────────────────────────────────────────────────────
// src/services/pushAPI.js
//
// Client wrapper around /api/push: the key a phone subscribes with,
// and telling the server which phone belongs to whoever is signed in.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from './api';

export const getPushPublicKey = async () => {
  const body = await apiGet('/api/push/public-key');
  return body.data?.publicKey ?? null;
};

export const savePushSubscription = async (subscription) => {
  await apiPost('/api/push/subscribe', { subscription });
};

export const removePushSubscription = async (endpoint) => {
  await apiPost('/api/push/unsubscribe', { endpoint });
};
