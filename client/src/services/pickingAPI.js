
const BASE = '/api/picking';

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || 'Something went wrong.');
  }
  return json.data;
}

export const pickingApi = {
  listSlips: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return request(`${qs ? `?${qs}` : ''}`);
  },
  getSlip: (id) => request(`/${id}`),
  generateSlips: (body) => request('/generate', { method: 'POST', body }),
  createSlip: (body) => request('', { method: 'POST', body }),
  assignSlip: (id, body = {}) => request(`/${id}/assign`, { method: 'POST', body }),
  confirmItem: (id, itemId, body) =>
    request(`/${id}/items/${itemId}/confirm`, { method: 'POST', body }),
  flagItem: (id, itemId, body) =>
    request(`/${id}/items/${itemId}/flag`, { method: 'POST', body }),
  completeSlip: (id, body = {}) => request(`/${id}/complete`, { method: 'POST', body }),
};