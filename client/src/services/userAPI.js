// ─────────────────────────────────────────────────────────────
// src/services/userAPI.js
//
// Client wrapper around /api/users. Mirrors user.controller.js — one
// function per route. Same two jobs as supplierAPI.js:
//   1. Unwrap the { success, data } envelope, so components get the
//      array or object they expect rather than the whole body.
//   2. Map snake_case to camelCase in one place, so every screen
//      reading a user gets the same shape.
//
// toUser NEVER MAPS password_hash. The server's SELECT list already
// omits it (see user.repository.js's USER_COLUMNS), so there is
// nothing here to drop — this comment is the guard against a future
// column ever being added to that list and silently reaching the UI.
//
// There is no delete for users, same reasoning as suppliers: an
// account is a record of who did what, and audit_log needs the actor
// row to keep meaning something. Deactivation is the removal path.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch, apiDelete } from "./api";

// ── Row mapper ────────────────────────────────────────────────
export const toUser = (row) => ({
  id:        row.id,
  username:  row.username,
  firstName: row.first_name ?? "",
  lastName:  row.last_name ?? "",
  role:      row.role,
  isActive:  Boolean(row.is_active),
});

// ── Users ─────────────────────────────────────────────────────
export const getUsers = async ({ includeInactive = false, search = "" } = {}) => {
  const params = new URLSearchParams();
  if (includeInactive) params.set("includeInactive", "true");
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString();
  const body = await apiGet(`/api/users${qs ? `?${qs}` : ""}`);
  return (body.data ?? []).map(toUser);
};

export const getUser = async (id) => {
  const body = await apiGet(`/api/users/${id}`);
  return toUser(body.data ?? {});
};

// payload carries a plaintext password on create only — the server
// hashes it (see user.service.js) and never returns it.
export const createUser = async (payload) => {
  const body = await apiPost("/api/users", payload);
  return toUser(body.data ?? {});
};

// patch never carries a password — edit does not touch it.
export const updateUser = async (id, patch) => {
  const body = await apiPatch(`/api/users/${id}`, patch);
  return toUser(body.data ?? {});
};

export const setUserStatus = async (id, isActive) => {
  const body = await apiPatch(`/api/users/${id}/status`, { isActive });
  return toUser(body.data ?? {});
};

// Not a SQL DELETE — audit_log.actor_id references users, and BR-04's
// trail has to keep naming who did what. This revokes the login and
// takes the account out of the directory.
export const deleteUser = async (id) => {
  const body = await apiDelete(`/api/users/${id}`);
  return toUser(body.data ?? {});
};

export default {
  getUsers, getUser, createUser, updateUser, setUserStatus, deleteUser,
};
