// server/test/integration/donationAdmin.integration.test.js
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { buildDonationAdminApp } from '../helpers/buildDonationAdminApp.js';
import { buildDonationIntakeApp } from '../helpers/buildDonationIntakeApp.js';
import {
  createTestUser, createTestProduct, snapshotCategoryRouting,
  restoreCategoryRouting, cleanupTestData, closeTestDb, cleanupPersistentUsers,
  trackProductIds, trackFlagIds
} from '../helpers/testDb.js';
import { authCookie } from '../helpers/testAuth.js';
import pool from '../../src/config/db.js';

const app = buildDonationAdminApp();
const intakeApp = buildDonationIntakeApp();
let manager, worker;

beforeAll(async () => {
  manager = await createTestUser('manager', { persistent: true });
  worker = await createTestUser('warehouse_worker', { persistent: true });
});
afterEach(async () => { await cleanupTestData(); });
afterAll(async () => {
  await cleanupPersistentUsers();
  await closeTestDb();
});
describe('GET /api/donations/admin/category-routing', () => {
  it('returns the 4 category rules for an authenticated manager', async () => {
    const res = await request(app).get('/api/donations/admin/category-routing').set('Cookie', authCookie(manager));
    expect(res.status).toBe(200);
    const categories = res.body.data.map((r) => r.category);
    expect(categories).toEqual(expect.arrayContaining(['recipe_food', 'add_on_food', 'non_recipe_food', 'non_food']));
  });
  it('rejects unauthenticated with 401', async () => {
    const res = await request(app).get('/api/donations/admin/category-routing');
    expect(res.status).toBe(401);
  });
  it('rejects worker role with 403', async () => {
    const res = await request(app).get('/api/donations/admin/category-routing').set('Cookie', authCookie(worker));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/donations/admin/category-routing/:category', () => {
  it('updates a real rule and restores it', async () => {
    const original = await snapshotCategoryRouting('non_food');
    try {
      const res = await request(app)
        .patch('/api/donations/admin/category-routing/non_food')
        .set('Cookie', authCookie(manager))
        .send({ routingOutcome: 'manual_review_itest', storageArea: 'mezzanine', description: 'itest override' });
      expect(res.status).toBe(200);
      expect(res.body.data.routing_outcome).toBe('manual_review_itest');
    } finally {
      await restoreCategoryRouting(original);
    }
  });
  it('rejects invalid category with 400', async () => {
    const res = await request(app)
      .patch('/api/donations/admin/category-routing/not_a_real_category')
      .set('Cookie', authCookie(manager)).send({ routingOutcome: 'x' });
    expect(res.status).toBe(400);
  });
  it('rejects invalid storageArea enum with 400', async () => {
    const original = await snapshotCategoryRouting('non_food');
    try {
      const res = await request(app)
        .patch('/api/donations/admin/category-routing/non_food')
        .set('Cookie', authCookie(manager))
        .send({ routingOutcome: 'manual_review_itest', storageArea: 'not_a_real_enum_value' });
      expect(res.status).toBe(400);
    } finally {
      await restoreCategoryRouting(original);
    }
  });
});

describe('POST /api/donations/intake/unrecognized', () => {
   it('creates a stub product and pending_classification flag', async () => {
     const res = await request(intakeApp)
       .post('/api/donations/intake/unrecognized')
       .set('Cookie', authCookie(manager))
       .send({ description: 'Mystery crate', quantity: 12.5, reason: 'Needs manager review' });

     expect(res.status).toBe(201);
     expect(res.body.success).toBe(true);

     const productId = Number(res.body.data.productId);
     const productRow = await pool.query(
       `SELECT p.id, p.name, p.is_active, d.donation_category, p.stock_keeping_unit, p.storage_type, p.default_unit, p.is_decantable, p.code_type, p.is_perishable
        FROM products p
        LEFT JOIN donation_routing_defaults d ON d.product_id = p.id
        WHERE p.id = $1`,
       [productId]
     );
     expect(productRow.rows).toHaveLength(1);
     expect(productRow.rows[0].name).toContain('[Unclassified]');
     expect(productRow.rows[0].is_active).toBe(false);
     expect(productRow.rows[0].donation_category).toBeNull();
     expect(productRow.rows[0].storage_type).toBe('dry');
     expect(productRow.rows[0].default_unit).toBe('kg');
     expect(productRow.rows[0].is_decantable).toBe(false);
     expect(productRow.rows[0].code_type).toBe('fixed');
     expect(productRow.rows[0].is_perishable).toBe(false);

     const flagRow = await pool.query(
       `SELECT id, product_id, status, reason FROM warehouse_manager_flags WHERE product_id = $1`,
       [productId]
     );
     expect(flagRow.rows).toHaveLength(1);
     expect(flagRow.rows[0].status).toBe('pending_classification');
     expect(flagRow.rows[0].reason).toContain('Needs manager review');

     trackProductIds([productId]);
     trackFlagIds([flagRow.rows[0].id]);
   });
});

describe('GET /api/donations/admin/pending-classifications', () => {
   it('returns pending items and excludes them from products-with-defaults', async () => {
     const createRes = await request(intakeApp)
       .post('/api/donations/intake/unrecognized')
       .set('Cookie', authCookie(manager))
       .send({ description: 'Mystery crate', quantity: 12.5, reason: 'Needs manager review' });

     const productId = Number(createRes.body.data.productId);
     const flagRow = await pool.query('SELECT id FROM warehouse_manager_flags WHERE product_id = $1', [productId]);
     const flagId = flagRow.rows[0].id;
     trackProductIds([productId]);
     trackFlagIds([flagId]);

     const res = await request(app)
       .get('/api/donations/admin/pending-classifications')
       .set('Cookie', authCookie(manager));

     expect(res.status).toBe(200);
     const item = res.body.data.find((row) => row.product_id === productId);
     expect(item).toBeTruthy();
     expect(item.status).toBe('pending_classification');

     const productListRes = await request(app)
       .get('/api/donations/admin/products-with-defaults')
       .set('Cookie', authCookie(manager));
     expect(productListRes.status).toBe(200);
     expect(productListRes.body.data.some((row) => row.id === productId)).toBe(false);
   });

   it('supports countOnly=true', async () => {
     const createRes = await request(intakeApp)
       .post('/api/donations/intake/unrecognized')
       .set('Cookie', authCookie(manager))
       .send({ description: 'Count test item', quantity: 4, reason: 'Manage me' });

     const productId = Number(createRes.body.data.productId);
     const flagRow = await pool.query('SELECT id FROM warehouse_manager_flags WHERE product_id = $1', [productId]);
     trackProductIds([productId]);
     trackFlagIds([flagRow.rows[0].id]);

     const res = await request(app)
       .get('/api/donations/admin/pending-classifications?countOnly=true')
       .set('Cookie', authCookie(manager));

     expect(res.status).toBe(200);
     expect(Number(res.body.count)).toBeGreaterThanOrEqual(1);
     expect(Number(res.body.count)).toBeGreaterThanOrEqual(1);
   });
});

describe('PUT /api/donations/admin/pending-classifications/:id/finalize', () => {
   it('finalizes a pending item and marks it resolved', async () => {
     const createRes = await request(intakeApp)
       .post('/api/donations/intake/unrecognized')
       .set('Cookie', authCookie(manager))
       .send({ description: 'Item to resolve', quantity: 9, reason: 'needs classification' });

     const productId = Number(createRes.body.data.productId);
     const flagRow = await pool.query('SELECT id FROM warehouse_manager_flags WHERE product_id = $1', [productId]);
     const flagId = flagRow.rows[0].id;
     trackProductIds([productId]);
     trackFlagIds([flagId]);

     const res = await request(app)
       .put(`/api/donations/admin/pending-classifications/${flagId}/finalize`)
       .set('Cookie', authCookie(manager))
       .send({
         name: 'Fresh Produce Box',
         sku: 'REAL-BOX-001',
         storageType: 'cold',
         defaultUnit: 'count',
         category: 'recipe_food',
       });

     expect(res.status).toBe(200);
     expect(res.body.success).toBe(true);
     expect(res.body.data.product.name).toBe('Fresh Produce Box');
     expect(res.body.data.product.default_unit).toBe('count');
     expect(res.body.data.product.storage_type).toBe('cold');
     expect(res.body.data.flag.status).toBe('resolved');

     const productRow = await pool.query(
       `SELECT p.is_active, p.default_unit, p.storage_type, p.stock_keeping_unit, d.donation_category
        FROM products p
        LEFT JOIN donation_routing_defaults d ON d.product_id = p.id
        WHERE p.id = $1`,
       [productId]
     );
     expect(productRow.rows[0].is_active).toBe(true);
     expect(productRow.rows[0].default_unit).toBe('count');
     expect(productRow.rows[0].storage_type).toBe('cold');
     expect(productRow.rows[0].stock_keeping_unit).toBe('REAL-BOX-001');
     expect(productRow.rows[0].donation_category).toBe('recipe_food');

     const flagAfter = await pool.query('SELECT status FROM warehouse_manager_flags WHERE id = $1', [flagId]);
     expect(flagAfter.rows[0].status).toBe('resolved');
   });
});

describe('GET /api/donations/admin/products-with-defaults', () => {
  it('includes a freshly created unclassified product', async () => {
    const product = await createTestProduct();
    const res = await request(app).get('/api/donations/admin/products-with-defaults').set('Cookie', authCookie(manager));
    const match = res.body.data.find((p) => p.id === product.id);
    expect(match.donation_category).toBeNull();
  });
});

describe('PUT /api/donations/admin/products/:id/classification', () => {
  it('sets and reads back a classification', async () => {
    const product = await createTestProduct();
    const setRes = await request(app)
      .put(`/api/donations/admin/products/${product.id}/classification`)
      .set('Cookie', authCookie(manager)).send({ category: 'non_food' });
    expect(setRes.status).toBe(200);
    expect(setRes.body.data.donation_category).toBe('non_food');
  });
  it('rejects invalid category with 400', async () => {
    const product = await createTestProduct();
    const res = await request(app)
      .put(`/api/donations/admin/products/${product.id}/classification`)
      .set('Cookie', authCookie(manager)).send({ category: 'not_a_real_category' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/donations/admin/products/:id/classification', () => {
  it('removes an existing classification', async () => {
    const product = await createTestProduct();
    await request(app).put(`/api/donations/admin/products/${product.id}/classification`).set('Cookie', authCookie(manager)).send({ category: 'recipe_food' });
    const delRes = await request(app).delete(`/api/donations/admin/products/${product.id}/classification`).set('Cookie', authCookie(manager));
    expect(delRes.status).toBe(200);
  });
  it('404s when nothing to remove', async () => {
    const product = await createTestProduct();
    const res = await request(app).delete(`/api/donations/admin/products/${product.id}/classification`).set('Cookie', authCookie(manager));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/donations/admin/evaluate-routing', () => {
  it('resolves via product default', async () => {
    const product = await createTestProduct();
    await request(app).put(`/api/donations/admin/products/${product.id}/classification`).set('Cookie', authCookie(manager)).send({ category: 'non_food' });
    const res = await request(app).post('/api/donations/admin/evaluate-routing').set('Cookie', authCookie(manager)).send({ productId: product.id });
    expect(res.body.data.source).toBe('product_default');
  });
  it('falls back to unclassified with nothing provided', async () => {
    const res = await request(app).post('/api/donations/admin/evaluate-routing').set('Cookie', authCookie(manager)).send({});
    expect(res.body.data.source).toBe('unclassified');
  });
});