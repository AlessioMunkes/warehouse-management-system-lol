import { apiGet, apiPost } from './api';

const buildQuery = (params = {}) => {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else {
      query.set(key, value);
    }
  }

  const text = query.toString();
  return text ? `?${text}` : '';
};

export const getFinanceReport = (params = {}) =>
  apiGet(`/api/finance/report${buildQuery(params)}`).then((res) => res.data ?? res);

export const getPublicFinanceReport = (token, params = {}) =>
  apiGet(`/api/finance/public/${encodeURIComponent(token)}/report${buildQuery(params)}`)
    .then((res) => res.data ?? res);

export const getFinanceEmailSettings = () =>
  apiGet('/api/finance/email-settings').then((res) => res.data ?? res);

export const saveFinanceEmailSettings = ({ recipientEmail }) =>
  apiPost('/api/finance/email-settings', { recipientEmail }).then((res) => res.data ?? res);

export const sendFinanceReportLink = () =>
  apiPost('/api/finance/report-link/send', {}).then((res) => res.data ?? res);

export default {
  getFinanceReport,
  getPublicFinanceReport,
  getFinanceEmailSettings,
  saveFinanceEmailSettings,
  sendFinanceReportLink,
};
