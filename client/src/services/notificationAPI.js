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

export default {
  getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead,
};
