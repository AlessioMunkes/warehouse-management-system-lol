// This API wrapper keeps the donation admin product-classification calls in one place.
// It mirrors the project pattern used elsewhere: the page code calls a thin service and
// the service handles the authenticated fetch, JSON parsing, and server error conversion.

export const PRODUCT_CLASSIFICATION_CATEGORIES = [
  'recipe_food',
  'add_on_food',
  'non_recipe_food',
  'non_food',
];

const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5000' : '');

const parseResponse = async (response) => {
  let payload;

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(payload.message || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  return payload;
};

const donationClassificationAPI = {
  // NOTE: the pending-classifications endpoints were removed from here.
  // GET /admin/pending-classifications (the flagged-items source of truth)
  // and POST /api/donations/pending/flags/:flagId/resolve (the unified
  // resolve endpoint) live on donationManagementAPI — the Flagged Items tab
  // of the Donation Management page is the single UI for this data. The old
  // Unrecognized Item Review Queue page was retired: it duplicated this
  // view and resolved through the legacy PUT .../finalize path.

  async getProductsWithDefaults() {
    const response = await fetch(`${API_BASE}/api/donations/admin/products-with-defaults`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await parseResponse(response);
    return Array.isArray(body.data) ? body.data : [];
  },

  async setProductClassification(productId, category) {
    const response = await fetch(`${API_BASE}/api/donations/admin/products/${productId}/classification`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });

    const body = await parseResponse(response);
    return body.data;
  },

  async removeProductClassification(productId) {
    const response = await fetch(`${API_BASE}/api/donations/admin/products/${productId}/classification`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await parseResponse(response);
    return body;
  },
};

export default donationClassificationAPI;
