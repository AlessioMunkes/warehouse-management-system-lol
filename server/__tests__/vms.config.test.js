import { afterEach, describe, expect, it } from 'vitest';
import { getVmsConfig, requireVmsConfig } from '../src/config/vms.js';

const original = {
  VMS_BASE_URL: process.env.VMS_BASE_URL,
  VMS_API_TOKEN: process.env.VMS_API_TOKEN,
  VMS_ADAPTER: process.env.VMS_ADAPTER,
};

afterEach(() => {
  if (original.VMS_BASE_URL === undefined) delete process.env.VMS_BASE_URL;
  else process.env.VMS_BASE_URL = original.VMS_BASE_URL;

  if (original.VMS_API_TOKEN === undefined) delete process.env.VMS_API_TOKEN;
  else process.env.VMS_API_TOKEN = original.VMS_API_TOKEN;

  if (original.VMS_ADAPTER === undefined) delete process.env.VMS_ADAPTER;
  else process.env.VMS_ADAPTER = original.VMS_ADAPTER;
});

describe('VMS config', () => {
  it('reads and trims VMS environment variables', () => {
    process.env.VMS_BASE_URL = ' https://vms.example.test ';
    process.env.VMS_API_TOKEN = ' dev-token ';

    expect(getVmsConfig()).toEqual({
      baseUrl: 'https://vms.example.test',
      apiToken: 'dev-token',
      adapter: 'mock',
    });
  });

  it('returns empty strings when VMS environment variables are unset', () => {
    delete process.env.VMS_BASE_URL;
    delete process.env.VMS_API_TOKEN;

    expect(getVmsConfig()).toEqual({
      baseUrl: '',
      apiToken: '',
      adapter: 'mock',
    });
  });

  it('requires both VMS_BASE_URL and VMS_API_TOKEN for active integration use', () => {
    process.env.VMS_BASE_URL = 'https://vms.example.test';
    delete process.env.VMS_API_TOKEN;

    expect(() => requireVmsConfig()).toThrow(/VMS_BASE_URL and VMS_API_TOKEN/);
  });

  it('returns config when active integration settings are present', () => {
    process.env.VMS_BASE_URL = 'https://vms.example.test';
    process.env.VMS_API_TOKEN = 'dev-token';

    expect(requireVmsConfig()).toEqual({
      baseUrl: 'https://vms.example.test',
      apiToken: 'dev-token',
      adapter: 'mock',
    });
  });
});
