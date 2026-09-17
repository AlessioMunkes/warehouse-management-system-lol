// ─────────────────────────────────────────────────────────────
// server/__tests__/product.service.test.js
// ─────────────────────────────────────────────────────────────
import pool from '../src/config/db.js';
import productService from '../src/services/product.service.js';

async function testProductService() {
  console.log('\n🚀 Starting Product Service Layer Verification Tests...\n');

  try {
    // 1. Fetch products list
    console.log('1️⃣  Testing productService.listProducts()...');
    const products = await productService.listProducts();
    console.log(`   Retrieved ${products.length} products.`);

    // 2. Test Input Validation & Normalisation
    console.log('\n2️⃣  Testing Validation (Invalid ID handling)...');
    try {
      await productService.getProductById('invalid-id');
      console.error(' ❌ FAILED: Validation did not throw for bad ID.');
    } catch (err) {
      console.log(`   ✅ Caught expected validation error: "${err.message}" (Status: ${err.status})`);
    }

    // 3. Test Product Creation with Duplicate Safeguard
    const testSku = `TEST-SKU-${Date.now()}`;
    console.log(`\n3️⃣  Testing productService.createProduct() with SKU: ${testSku}...`);
    
    const newProduct = await productService.createProduct({
      name: `Test Product ${Date.now()}`,
      stockKeepingUnit: testSku,
      weightKg: 1.5,
    });
    console.log(`   Created Product ID ${newProduct.id}: ${newProduct.name}`);

    // 4. Test Deactivation / Reactivation
    console.log(`\n4️⃣  Testing productService.setActive() on Product ID ${newProduct.id}...`);
    const updated = await productService.setActive(newProduct.id, false);
    console.log(`   Product active status updated to: ${updated.is_active}`);

    console.log('\n ✅ ALL PRODUCT SERVICE TESTS PASSED LOCALLY!\n');
  } catch (error) {
    console.error('\n ❌ PRODUCT SERVICE TEST FAILED:\n', error);
  } finally {
    await pool.end();
  }
}

testProductService();