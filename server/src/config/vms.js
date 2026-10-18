// server/src/config/vms.js
//
// Environment-backed VMS integration settings.

const readTrimmed = (name) => String(process.env[name] || '').trim();

export const getVmsConfig = () => ({
  baseUrl: readTrimmed('VMS_BASE_URL'),
  apiToken: readTrimmed('VMS_API_TOKEN'),
  adapter: readTrimmed('VMS_ADAPTER') || 'mock',
});

export const requireVmsConfig = () => {
  const config = getVmsConfig();

  if (!config.baseUrl || !config.apiToken) {
    const err = new Error(
      'VMS integration is not configured. Set VMS_BASE_URL and VMS_API_TOKEN in the server environment.'
    );
    err.status = 503;
    throw err;
  }

  return config;
};

export const getVmsAdapterName = () => {
  const adapter = getVmsConfig().adapter.toLowerCase();
  if (adapter !== 'mock' && adapter !== 'real') {
    const err = new Error('VMS_ADAPTER must be one of: mock, real.');
    err.status = 400;
    throw err;
  }
  return adapter;
};
