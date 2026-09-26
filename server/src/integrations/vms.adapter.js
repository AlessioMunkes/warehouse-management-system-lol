// server/src/integrations/vms.adapter.js
//
// Config-driven adapter selection. Defaults safely to the mock adapter.
import { getVmsAdapterName, requireVmsConfig } from '../config/vms.js';
import mockVMSAdapter from './mockVMS.adapter.js';
import realVMSAdapter from './realVMS.adapter.js';

export const createVMSAdapter = () => {
  const adapterName = getVmsAdapterName();
  if (adapterName === 'real') {
    requireVmsConfig();
    return realVMSAdapter;
  }
  return mockVMSAdapter;
};

export const getVMSAdapter = createVMSAdapter;

export default {
  createVMSAdapter,
  getVMSAdapter,
};
