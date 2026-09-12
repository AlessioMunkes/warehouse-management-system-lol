// ─────────────────────────────────────────────────────────────
// server/__tests__/donationValidation.test.js
//
// Unit tests for the shared donation-intake validators in
// server/src/lib/validation/*. These are the same rules the client
// mirrors (client/src/lib/validation/*), and the backend treats them
// as source of truth at submit time.
//
// Coverage maps to the Donation Intake validation checklist:
// SA ID (valid/checksum/date), passport, SARS tax reference, email,
// phone, country, postal code, quantity, money, boundary lengths,
// SQL/script injection attempts, and empty / whitespace-only values.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  validateSaIdNumber,
  validatePassportNumber,
  validateTaxReference,
  validateEmail,
  validateSaPhone,
  validateCountry,
  validateProvince,
  validatePostalCode,
  validateQuantity,
  validateMoney,
  validateDonorName,
  validateCompanyName,
  validateStreetAddress,
  validateIsoDate,
  validateDonationPayload,
  donationFingerprint,
} from '../src/lib/validation/donationIntake.js';

// ── SA ID number ─────────────────────────────────────────────
describe('validateSaIdNumber', () => {
  const VALID_IDS = ['8001015009087', '9501015009085', '8604055009089'];
  it.each(VALID_IDS)('accepts a valid 13-digit SA ID: %s', (id) => {
    const r = validateSaIdNumber(id, { required: true });
    expect(r.error).toBeNull();
    expect(r.value).toBe(id);
  });

  it('rejects a valid-length ID with a bad checksum', () => {
    // DOB 1990-01-01 is real, but the Luhn-style check digit is wrong.
    const r = validateSaIdNumber('9001011234089', { required: true });
    expect(r.error).toBeTruthy();
  });

  it('rejects the all-zeros ID (impossible + bad checksum)', () => {
    const r = validateSaIdNumber('0000000000000', { required: true });
    expect(r.error).toBeTruthy();
  });

  it('rejects an impossible date (Feb 31)', () => {
    const r = validateSaIdNumber('9902311234089', { required: true });
    expect(r.error).toMatch(/date of birth/i);
  });

  it('rejects the wrong length', () => {
    expect(validateSaIdNumber('800101500908', { required: true }).error).toBeTruthy();
    expect(validateSaIdNumber('80010150090871', { required: true }).error).toBeTruthy();
  });

  it('rejects alphabetic characters and interior spaces', () => {
    expect(validateSaIdNumber('80010150A09087', { required: true }).error).toBeTruthy();
    expect(validateSaIdNumber('8001015 009087', { required: true }).error).toBeTruthy();
  });

  it('rejects a malformed citizenship digit', () => {
    // Positions: yy mm dd sss s citizenship check — a non-0/1 citizenship digit is invalid.
    const r = validateSaIdNumber('80010150099087'.slice(0, 13), { required: true });
    expect(r.error).toBeTruthy();
  });

  it('accepts an empty optional value and rejects an empty required one', () => {
    expect(validateSaIdNumber('', {}).error).toBeNull();
    expect(validateSaIdNumber('', { required: true }).error).toBeTruthy();
  });
});

// ── Passport ─────────────────────────────────────────────────
describe('validatePassportNumber', () => {
  it('accepts alphanumeric passports within 6-20 chars', () => {
    expect(validatePassportNumber('A1234567', { required: true }).error).toBeNull();
    expect(validatePassportNumber('N987654321', { required: true }).error).toBeNull();
    expect(validatePassportNumber('PA123456789012345678', { required: true }).error).toBeNull();
  });

  it('rejects numbers shorter than 6 or longer than 20 chars', () => {
    expect(validatePassportNumber('A12', { required: true }).error).toBeTruthy();
    expect(validatePassportNumber('A'.padEnd(21, '1'), { required: true }).error).toBeTruthy();
  });

  it('rejects spaces and disallowed symbols', () => {
    expect(validatePassportNumber('A1 234', { required: true }).error).toBeTruthy();
    expect(validatePassportNumber('A1@2345', { required: true }).error).toBeTruthy();
  });

  it('allows a hyphen as the permitted separator', () => {
    expect(validatePassportNumber('AB-12345', { required: true }).error).toBeNull();
  });
});

// ── SARS income tax reference ────────────────────────────────
describe('validateTaxReference', () => {
  it('accepts a 10-digit SARS reference', () => {
    expect(validateTaxReference('1234567890', { required: true }).error).toBeNull();
  });

  it('rejects alphabetic characters', () => {
    expect(validateTaxReference('ABC123', { required: true }).error).toBeTruthy();
  });

  it('rejects wrong lengths', () => {
    expect(validateTaxReference('12345', { required: true }).error).toBeTruthy();
    expect(validateTaxReference('12345678901', { required: true }).error).toBeTruthy();
  });
});
// ── Email ────────────────────────────────────────────────────
describe('validateEmail', () => {
  it('accepts a valid RFC-style address and lowercases it', () => {
    const r = validateEmail('Admin@LadlesOfLove.org.za', { required: true });
    expect(r.error).toBeNull();
    expect(r.value).toBe('admin@ladlesoflove.org.za');
  });

  it('rejects missing/invalid local or domain parts', () => {
    expect(validateEmail('abc', { required: true }).error).toBeTruthy();
    expect(validateEmail('abc@', { required: true }).error).toBeTruthy();
    expect(validateEmail('abc@gmail', { required: true }).error).toBeTruthy();
    expect(validateEmail('@gmail.com', { required: true }).error).toBeTruthy();
    expect(validateEmail('abc @gmail.com', { required: true }).error).toBeTruthy();
  });
});

// ── Phone ────────────────────────────────────────────────────
describe('validateSaPhone', () => {
  it('accepts SA mobile and landline formats', () => {
    expect(validateSaPhone('0712345678', { required: true }).error).toBeNull();
    expect(validateSaPhone('0821234567', { required: true }).error).toBeNull();
    expect(validateSaPhone('0215551234', { required: true }).error).toBeNull();
  });

  it('accepts the optional +27 prefix and normalises to a leading 0', () => {
    expect(validateSaPhone('+27712345678', { required: true }).value).toBe('0712345678');
    expect(validateSaPhone('+27215551234', { required: true }).value).toBe('0215551234');
  });

  it('rejects alphabetic and malformed numbers', () => {
    expect(validateSaPhone('123', { required: true }).error).toBeTruthy();
    expect(validateSaPhone('abc123', { required: true }).error).toBeTruthy();
    expect(validateSaPhone('+279999', { required: true }).error).toBeTruthy();
  });
});

// ── Country / province / postal code ─────────────────────────
describe('address validators', () => {
  it('accepts letter/space/hyphen country names, rejects digits and symbols', () => {
    expect(validateCountry('South Africa', { required: true }).error).toBeNull();
    expect(validateCountry("C\u00f4te d\u2019Ivoire", { required: true }).error).toBeNull();
    expect(validateCountry('South Africa1', { required: true }).error).toBeTruthy();
    expect(validateCountry('RSA123', { required: true }).error).toBeTruthy();
    expect(validateCountry('@SouthAfrica', { required: true }).error).toBeTruthy();
  });

  it('restricts province to the nine official provinces when South Africa', () => {
    expect(validateProvince('Gauteng', { country: 'South Africa' }).error).toBeNull();
    expect(validateProvince('KwaZulu-Natal', { country: 'South Africa' }).error).toBeNull();
    expect(validateProvince('Cape Town', { country: 'South Africa' }).error).toBeTruthy();
    expect(validateProvince('', { country: 'South Africa' }).error).toBeTruthy();
    expect(validateProvince('', { country: 'United Kingdom' }).error).toBeNull();
  });

  it('validates SA postal codes as exactly 4 digits', () => {
    expect(validatePostalCode('8001', { country: 'South Africa' }).error).toBeNull();
    expect(validatePostalCode('2196', { country: 'South Africa' }).error).toBeNull();
    expect(validatePostalCode('123', { country: 'South Africa' }).error).toBeTruthy();
    expect(validatePostalCode('12345', { country: 'South Africa' }).error).toBeTruthy();
    expect(validatePostalCode('ABCD', { country: 'South Africa' }).error).toBeTruthy();
  });
});
// ── Quantity & money ─────────────────────────────────────────
describe('numeric validators', () => {
  it('accepts positive quantities, rejects zero/negative/text', () => {
    expect(validateQuantity('25').error).toBeNull();
    expect(validateQuantity('0').error).toMatch(/greater than zero/);
    expect(validateQuantity('-5').error).toBeTruthy();
    expect(validateQuantity('abc').error).toBeTruthy();
    expect(validateQuantity('').error).toBeTruthy();
  });

  it('accepts at most two decimal places in monetary values', () => {
    expect(validateMoney('12.99', { required: true, field: 'Amount' }).error).toBeNull();
    expect(validateMoney('12.345', { required: true, field: 'Amount' }).error).toBeTruthy();
    expect(validateMoney('abc', { required: true, field: 'Amount' }).error).toBeTruthy();
    expect(validateMoney('-50', { required: true, field: 'Amount' }).error).toMatch(/negative/);
  });
});

// ── Boundaries, injection, whitespace, trims ─────────────────
describe('boundaries, injection and whitespace', () => {
  it('enforces minimum and maximum name lengths', () => {
    expect(validateDonorName('A', {}).error).toMatch(/at least 2/);
    expect(validateDonorName('A'.repeat(121), {}).error).toMatch(/120|fewer/);
    expect(validateDonorName("O\u2019Connor", {}).error).toBeNull();
  });

  it('strips surrounding whitespace', () => {
    expect(validateDonorName('  John Smith  ', {}).value).toBe('John Smith');
    expect(validateEmail('  A@b.com  ', { required: true }).value).toBe('a@b.com');
  });

  it('rejects whitespace-only values', () => {
    expect(validateDonorName('   ', {}).error).toBeTruthy();
    expect(validateCompanyName('   ', { required: true }).error).toBeTruthy();
    expect(validateStreetAddress('   ', { required: true }).error).toBeTruthy();
  });

  it('rejects SQL and script injection payloads', () => {
    expect(validateDonorName("'); DROP TABLE donations;--", {}).error).toBeTruthy();
    expect(validateDonorName('<script>alert(1)</script>', {}).error).toBeTruthy();
    expect(validateCompanyName('x; DELETE FROM users;--', { required: false }).error).toBeTruthy();
  });

  it('rejects lone symbols/HTML in donor names', () => {
    expect(validateDonorName('@John', {}).error).toBeTruthy();
    expect(validateDonorName('John123', {}).error).toBeTruthy();
  });
});
// ── Dates & duplicate prevention ────────────────────────────
describe('dates and duplicate prevention', () => {
  it('accepts real calendar dates and rejects impossible ones', () => {
    expect(validateIsoDate('2026-02-28', {}).error).toBeNull();
    expect(validateIsoDate('2026-02-30', {}).error).toBeTruthy();
    expect(validateIsoDate('13-45-99', {}).error).toBeTruthy();
  });

  it('rejects a future donation date by default', () => {
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    expect(validateIsoDate(future, { allowFuture: false }).error).toMatch(/future/);
    expect(validateIsoDate(future, { allowFuture: true }).error).toBeNull();
  });

  it('produces a stable fingerprint for identical donations', () => {
    const a = donationFingerprint({ donorKey: '  Donor  ', items: [{ description: ' Rice ', quantity: 25, unit: 'kg' }], donationDate: '2026-09-10' });
    const b = donationFingerprint({ donorKey: 'donor', items: [{ description: 'rice', quantity: 25, unit: 'kg' }], donationDate: '2026-09-10' });
    expect(a).toBe(b);
  });
// ── Full payload validation ──────────────────────────────────
describe('validateDonationPayload', () => {
  it('collects structured, field-specific errors for a bad payload', () => {
    const r = validateDonationPayload({
      donorConsentGiven: true,
      donorType: 'natural_person',
      donorName: '@John123',
      donorContact: 'abc',
      donorContactNumber: 'abc123',
      donorTaxReference: 'ABC123',
      items: [{ description: '', quantity: 0 }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.donorName).toBeTruthy();
    expect(r.errors.donorContact).toBeTruthy();
    expect(r.errors.donorContactNumber).toBeTruthy();
    expect(r.errors.donorTaxReference).toBeTruthy();
    expect(r.errors.itemErrors[0]).toBeTruthy();
  });
});
});