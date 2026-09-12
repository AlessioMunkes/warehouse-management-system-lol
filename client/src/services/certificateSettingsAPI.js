// ─────────────────────────────────────────────────────────────
// client/src/services/certificateSettingsAPI.js
//
// Mock service layer for Certificate Settings.
// Swapping to the real API later only requires changing this file.
// ─────────────────────────────────────────────────────────────

// In-memory store simulating the backend
let mockSettings = {
  organization: {
    name: 'Ladles of Love',
    pboNumber: '930012345',
    section18aReference: 'S18A/2021/001234',
    physicalAddress: '123 Main Street\nCape Town\nWestern Cape 8001\nSouth Africa',
    postalAddress: 'PO Box 1234\nCape Town\nWestern Cape 8000\nSouth Africa',
    contactEmail: 'info@ladlesoflove.org.za',
    contactPhone: '+27 21 123 4567',
  },
  emailDefaults: {
    senderDisplayName: 'Ladles of Love',
    replyToEmail: 'donations@ladlesoflove.org.za',
    subjectTemplate: 'Thank you for your donation to {{organizationName}}',
  },
  certificateDefaults: {
    footerText: 'This certificate is issued for tax purposes in accordance with Section 18A of the Income Tax Act.',
    signatureName: 'John Smith',
    signatureTitle: 'Executive Director',
    defaultAcknowledgementMessage: 'Thank you for your generous donation of {{amount}} on {{date}}. Your support helps us nourish children in need.',
  },
};

// Simulated network delay
const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const getSettings = async () => {
  await delay();
  // Return a deep copy to prevent accidental mutation
  return JSON.parse(JSON.stringify(mockSettings));
};

const saveSettings = async (settings) => {
  await delay();
  // In a real API, this would be a PATCH/PUT to /api/certificate-settings
  mockSettings = {
    ...mockSettings,
    ...settings,
    organization: { ...mockSettings.organization, ...settings.organization },
    emailDefaults: { ...mockSettings.emailDefaults, ...settings.emailDefaults },
    certificateDefaults: { ...mockSettings.certificateDefaults, ...settings.certificateDefaults },
  };
  return JSON.parse(JSON.stringify(mockSettings));
};

export default {
  getSettings,
  saveSettings,
};