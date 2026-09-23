// ─────────────────────────────────────────────────────────────
// src/services/notificationAPI.js
//
// Client wrapper around /api/notifications. Same two jobs as every
// other *API.js file: unwrap the envelope, map snake_case to
// camelCase.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPatch, apiPost } from "./api";

export const toNotification = (row) => ({
  id:         row.id,
  type:       row.type,
  title:      row.title,
  body:       row.body ?? "",
  entityType: row.entity_type ?? null,
  entityId:   row.entity_id ?? null,
  createdAt:  row.created_at,
  readAt:     row.read_at ?? null,
  isRead:     Boolean(row.read_at),
});

export const getNotifications = async ({ unreadOnly = false } = {}) => {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("unreadOnly", "true");
  const qs = params.toString();
  const body = await apiGet(`/api/notifications${qs ? `?${qs}` : ""}`);
  return (body.data ?? []).map(toNotification);
};

export const getUnreadCount = async () => {
  const body = await apiGet("/api/notifications/unread-count");
  return Number(body.data?.count ?? 0);
};

export const markNotificationRead = async (id) => {
  await apiPatch(`/api/notifications/${id}/read`, {});
};

export const markAllNotificationsRead = async () => {
  await apiPost("/api/notifications/read-all", {});
};

// ── Floor (worker-facing) ─────────────────────────────────────
// Same shapes as above, against the /floor routes — open to any
// authenticated staff member, narrowed server-side to picking-slip
// events instead of everything a manager sees.
export const getFloorNotifications = async ({ unreadOnly = false } = {}) => {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("unreadOnly", "true");
  const qs = params.toString();
  const body = await apiGet(`/api/notifications/floor${qs ? `?${qs}` : ""}`);
  return (body.data ?? []).map(toNotification);
};

export const getFloorUnreadCount = async () => {
  const body = await apiGet("/api/notifications/floor/unread-count");
  return Number(body.data?.count ?? 0);
};

export const markFloorNotificationRead = async (id) => {
  await apiPatch(`/api/notifications/floor/${id}/read`, {});
};

export const markAllFloorNotificationsRead = async () => {
  await apiPost("/api/notifications/floor/read-all", {});
};

export default {
  getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead,
  getFloorNotifications, getFloorUnreadCount, markFloorNotificationRead, markAllFloorNotificationsRead,
};
