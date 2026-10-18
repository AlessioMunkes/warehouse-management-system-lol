import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';
vi.mock('../src/repositories/decanting.repository.js', () => ({ default: {
  createDecanting: vi.fn(async x=>x), getDecantingRecords: vi.fn(), getDecantingById: vi.fn(), getWeeklyProcurementReport: vi.fn() }}));
const { default: svc } = await import('../src/services/decanting.service.js');
const { default: decantingRouter } = await import('../src/routes/decanting.routes.js');

// Mirror of client/src/features/decanting/bagSizes.js
const sizeLabelToKg = (l) => String(l).trim().endsWith('kg') ? parseFloat(l) : parseFloat(l)/1000;
const sizesToKg = (a) => Array.isArray(a) ? a.map(sizeLabelToKg) : undefined;
const STANDARD_SIZES = ['2kg','1kg','500g'];

describe('client -> server payload contract', () => {
  it('rejects raw display labels (the bug seen in the browser)', () => {
    expect(() => svc.calculateDecantingPlan({
      selectedSizes: STANDARD_SIZES, items: [{ productId: 1, requiredKg: 25 }],
    })).toThrow('Bag sizes must be positive numbers.');
  });

  it('accepts the converted payload the page now sends', () => {
    const { plans, summary } = svc.calculateDecantingPlan({
      selectedSizes: sizesToKg(STANDARD_SIZES),
      items: [
        { productId: 1, productName: 'Rice',  requiredKg: 25, actualBulkKg: 24 },
        { productId: 2, productName: 'Oats',  requiredKg: 50, selectedSizes: sizesToKg(['1kg','500g']) },
      ],
    });
    expect(plans[0].bags).toEqual({ '2kg': 12, '1kg': 0, '500g': 0 });
    expect(plans[1].sizesKg).toEqual([1, 0.5]);
    expect(summary.withinMargin).toBe(true);
  });

  it('every standard label converts to a positive number', () => {
    for (const kg of sizesToKg(STANDARD_SIZES)) {
      expect(Number.isFinite(kg)).toBe(true);
      expect(kg).toBeGreaterThan(0);
    }
    expect(sizesToKg(STANDARD_SIZES)).toEqual([2, 1, 0.5]);
  });
});


const exactChickenPayload = {
  selectedSizes: [10, 2],
  items: [{
    productId: 123,
    productName: 'Chicken Pieces (5kg)',
    requiredKg: 12,
    actualBulkKg: 12,
    wastageKg: 0,
  }],
};

describe('12kg Chicken Pieces custom [10,2] calculation contract', () => {
  it('service returns a full 10kg + 2kg custom plan with zero wastage', () => {
    const result = svc.calculateDecantingPlan(exactChickenPayload);

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      productId: 123,
      productName: 'Chicken Pieces (5kg)',
      sizesKg: [10, 2],
      bags: { '10kg': 1, '2kg': 1 },
      totalBags: 2,
      plannedKg: 12,
      packedKg: 12,
      partialBag: null,
      wastageKg: 0,
      shortfallKg: 0,
      surplusKg: 0,
      withinMargin: true,
      isBulkLimited: false,
    });
    expect(result.summary).toMatchObject({
      totalRequiredKg: 12,
      totalPlannedKg: 12,
      totalPackedKg: 12,
      totalBags: 2,
      totalSurplusKg: 0,
      totalShortfallKg: 0,
      withinMargin: true,
    });
  });

  it('route returns HTTP 200 and wraps the exact custom result under data', async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/decanting', decantingRouter);
    const token = jwt.sign(
      { id: 1, username: 'test.user', role: ROLES.WORKER },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .post('/api/decanting/calculate')
      .set('Cookie', [`wms_token=${token}`])
      .send(exactChickenPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plans[0]).toMatchObject({
      bags: { '10kg': 1, '2kg': 1 },
      packedKg: 12,
      partialBag: null,
      wastageKg: 0,
      shortfallKg: 0,
    });
  });
});
