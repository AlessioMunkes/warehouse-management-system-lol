import { afterEach, describe, expect, it } from 'vitest';
import mockVMSAdapter from '../src/integrations/mockVMS.adapter.js';
import realVMSAdapter from '../src/integrations/realVMS.adapter.js';
import { createVMSAdapter } from '../src/integrations/vms.adapter.js';

const original = {
  VMS_ADAPTER: process.env.VMS_ADAPTER,
  VMS_BASE_URL: process.env.VMS_BASE_URL,
  VMS_API_TOKEN: process.env.VMS_API_TOKEN,
};

const restore = (name) => {
  if (original[name] === undefined) delete process.env[name];
  else process.env[name] = original[name];
};

afterEach(() => {
  restore('VMS_ADAPTER');
  restore('VMS_BASE_URL');
  restore('VMS_API_TOKEN');
});

describe('VMS adapter selection', () => {
  it('defaults safely to the mock adapter', () => {
    delete process.env.VMS_ADAPTER;
    delete process.env.VMS_BASE_URL;
    delete process.env.VMS_API_TOKEN;

    expect(createVMSAdapter()).toBe(mockVMSAdapter);
  });

  it('uses mock when explicitly selected', () => {
    process.env.VMS_ADAPTER = 'mock';
    delete process.env.VMS_BASE_URL;
    delete process.env.VMS_API_TOKEN;

    expect(createVMSAdapter()).toBe(mockVMSAdapter);
  });

  it('uses real when explicitly selected and VMS config is present', () => {
    process.env.VMS_ADAPTER = 'real';
    process.env.VMS_BASE_URL = 'https://vms.example.test';
    process.env.VMS_API_TOKEN = 'secret-token';

    expect(createVMSAdapter()).toBe(realVMSAdapter);
  });

  it('fails cleanly when real is selected without VMS config', () => {
    process.env.VMS_ADAPTER = 'real';
    delete process.env.VMS_BASE_URL;
    delete process.env.VMS_API_TOKEN;

    expect(() => createVMSAdapter()).toThrow(/VMS integration is not configured/);
  });

  it('lets mock work with empty VMS config', async () => {
    process.env.VMS_ADAPTER = 'mock';
    process.env.VMS_BASE_URL = '';
    process.env.VMS_API_TOKEN = '';

    const adapter = createVMSAdapter();
    const result = await adapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' });

    expect(result.externalId).toBe('VMS-EVENT_BOOKING-e1');
  });
});
