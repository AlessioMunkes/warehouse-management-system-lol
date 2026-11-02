// ─────────────────────────────────────────────────────────────
// client/src/services/ftsDropPointAPI.js
//
// Feed the Soil drop-off sites (/api/fts, migration 069): the sites and
// what was logged at them, for managers, and the public form behind a
// site's QR code, which needs no sign-in.
// ─────────────────────────────────────────────────────────────
import { API_BASE, apiGet, apiPost, apiPatch } from "./api";

const toSite = (row) => ({
  id: row.id,
  name: row.name,
  suburb: row.suburb ?? "",
  address: row.address ?? "",
  publicToken: row.public_token,
  isActive: Boolean(row.is_active),
  dropoffCount: Number(row.dropoff_count ?? 0),
  kgTotal: Number(row.kg_total ?? 0),
  lastDropoffAt: row.last_dropoff_at ?? null,
});

const toDropoff = (row) => ({
  id: row.id,
  site: row.drop_point_name,
  // Typed under "Somewhere else" on the general poster's form.
  typedPlace: Boolean(row.typed_place),
  kg: Number(row.kg_compost),
  donorName: row.donor_name ?? "",
  askedForThanks: Boolean(row.asked_for_thanks),
  thanksStatus: row.thanks_status ?? null,
  status: row.status,
  submittedAt: row.submitted_at,
});

// ── Staff ────────────────────────────────────────────────────
export const getDropPoints = async () =>
  ((await apiGet("/api/fts/drop-points?includeInactive=true")).data ?? []).map(toSite);
export const createDropPoint = async (values) => toSite((await apiPost("/api/fts/drop-points", values)).data ?? {});
export const updateDropPoint = async (id, values) => toSite((await apiPatch(`/api/fts/drop-points/${id}`, values)).data ?? {});
export const getDropoffs = async () => ((await apiGet("/api/fts/dropoffs")).data ?? []).map(toDropoff);
export const setDropoffStatus = async (id, status) => (await apiPatch(`/api/fts/dropoffs/${id}`, { status })).data;

// ── Public: the form behind the QR code ───────────────────────
// Plain fetch: there is no session, and a refusal is the message the
// person reads.
const publicCall = async (path, init) => {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || "Something went wrong. Please try again.");
    err.status = res.status;
    throw err;
  }
  return body.data;
};

export const getPublicDropSite = (token) => publicCall(`/api/fts/drop/${encodeURIComponent(token)}`, { method: "GET" });
export const submitPublicDropoff = (token, values) =>
  publicCall(`/api/fts/drop/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify(values) });

// The general poster (migration 070): the open sites for its dropdown,
// and a drop-off at one of them ({ dropPointId }) or a place typed
// ({ place }).
export const getPublicDropSites = () => publicCall("/api/fts/drop", { method: "GET" });
export const submitAnyDropoff = (values) =>
  publicCall("/api/fts/drop", { method: "POST", body: JSON.stringify(values) });

export default {
  getDropPoints, createDropPoint, updateDropPoint, getDropoffs, setDropoffStatus,
  getPublicDropSite, submitPublicDropoff, getPublicDropSites, submitAnyDropoff,
};
