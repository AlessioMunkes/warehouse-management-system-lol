// server/test/integration/donationIntake.integration.test.js
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { buildDonationIntakeApp } from '../helpers/buildDonationIntakeApp.js';
import { createTestUser, createTestProduct, cleanupTestData, closeTestDb } from '../helpers/testDb.js';
import { authCookie } from '../helpers/testAuth.js';
import pool from '../../src/config/db.js';

const app = buildDonationIntakeApp();
let manager, worker;

beforeAll(async () => {
  manager = await createTestUser('manager');
  worker = await createTestUser('warehouse_worker');
});
afterEach(async () => { await cleanupTestData(); });
afterAll(async () => { await closeTestDb(); });

describe('POST /api/donations/intake', () => {
  it('food item: creates a stock_levels row', async () => {
    const product = await createTestProduct({ storageType: 'dry' });
    const res = await request(app).post('/api/donations/intake').set('Cookie', authCookie(manager))
      .send({ productId: product.id, quantityKg: 12.5, category: 'recipe_food' });
    expect(res.status).toBe(201);
    expect(res.body.data.ecdInventoryUpdated).toBe(true);
    const dbRow = await pool.query('SELECT quantity_on_hand FROM stock_levels WHERE product_id = $1', [product.id]);
    expect(Number(dbRow.rows[0].quantity_on_hand)).toBe(12.5);
  });

  it('accumulates stock across two intakes rather than overwriting', async () => {
    const product = await createTestProduct({ storageType: 'dry' });
    await request(app).post('/api/donations/intake').set('Cookie', authCookie(manager)).send({ productId: product.id, quantityKg: 5, category: 'recipe_food' });
    const res = await request(app).post('/api/donations/intake').set('Cookie', authCookie(manager)).send({ productId: product.id, quantityKg: 3, category: 'recipe_food' });
    expect(Number(res.body.data.totalEcdStockKg)).toBe(8);
  });

  it('non_food item: flags for manager review, does NOT touch stock_levels', async () => {
    const product = await createTestProduct();
    const res = await request(app).post('/api/donations/intake').set('Cookie', authCookie(manager))
      .send({ productId: product.id, quantityKg: 4, category: 'non_food' });
    expect(res.status).toBe(201);
    expect(res.body.data.managerFlagCreated).toBe(true);
    const flagRow = await pool.query('SELECT * FROM warehouse_manager_flags WHERE product_id = $1', [product.id]);
    expect(flagRow.rows.length).toBe(1);
    expect(flagRow.rows[0].status).toBe('pending');
    const stockRow = await pool.query('SELECT * FROM stock_levels WHERE product_id = $1', [product.id]);
    expect(stockRow.rows.length).toBe(0);
  });

  it('rejects negative quantity with 400', async () => {
    const product = await createTestProduct();
    const res = await request(app).post('/api/donations/intake').set('Cookie', authCookie(manager))
      .send({ productId: product.id, quantityKg: -5, category: 'recipe_food' });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated with 401', async () => {
    const res = await request(app).post('/api/donations/intake').send({ productId: 1, quantityKg: 5, category: 'recipe_food' });
    expect(res.status).toBe(401);
  });

  it('rejects worker role with 403', async () => {
    const res = await request(app).post('/api/donations/intake').set('Cookie', authCookie(worker)).send({ productId: 1, quantityKg: 5, category: 'recipe_food' });
    expect(res.status).toBe(403);
  });
});