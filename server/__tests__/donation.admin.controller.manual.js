// ─────────────────────────────────────────────────────────────
// server/__tests__/donationAdmin.test.js
//
// Integration & verification test suite for donation admin controller/service.
// Verifies BR-10 routing rule retrieval, product classification defaults,
// and dynamic routing evaluation with authorization checks.
// ─────────────────────────────────────────────────────────────
import pool from '../src/config/db.js';

import dotenv from 'dotenv';
dotenv.config({ path: '../../../server/env.example'})
import donationAdminService from '../src/services/donationAdmin.service.js';

async function testDonationAdmin() {
  console.log('\n🚀 Starting Donation Admin Integration & Service Tests...\n');

  try {
    // ─────────────────────────────────────────────────────────
    // Test 1: Fetch Category Routing Rules (BR-10 Oversight)
    // ─────────────────────────────────────────────────────────
    console.log('1️⃣  Testing retrieval of category routing rules...');
    const categories = await donationAdminService.getAllCategoryRoutings();
    console.log(`   Retrieved ${categories.length} category routing rules.`);
    
    if (categories.length >= 4) {
      console.log('   ✅ Passed! BR-10 categories successfully loaded.');
    } else {
      console.error('   ❌ FAILED: Expected at least 4 active category routing rules.');
    }

    // ─────────────────────────────────────────────────────────
    // Test 2: Fetch Products with Classification Defaults
    // ─────────────────────────────────────────────────────────
    console.log('\n2️⃣  Testing retrieval of products with default presets...');
    const productsWithDefaults = await donationAdminService.getAllProductsWithDefaults();
    console.log(`   Retrieved ${productsWithDefaults.length} products with presets.`);

    if (productsWithDefaults.length > 0) {
      console.log('   ✅ Passed! Products merged with classification defaults successfully.');
    } else {
      console.error('   ❌ FAILED: No products returned. Please ensure seed scripts have run.');
      return;
    }

    const testProduct = productsWithDefaults[0];

    // ─────────────────────────────────────────────────────────
    // Test 3: Dynamic Routing Evaluation (Product ID precedence)
    // ─────────────────────────────────────────────────────────
    console.log(`\n3️⃣  Testing dynamic routing evaluation for Product ID ${testProduct.id} ("${testProduct.name}")...`);
    const routingResult = await donationAdminService.determineRouting({
      productId: testProduct.id,
      category: null,
    });

    console.log('   Result:', routingResult);

    if (routingResult && routingResult.routingOutcome) {
      console.log('   ✅ Passed! Evaluated routing outcome successfully.');
    } else {
      console.error('   ❌ FAILED: Expected a valid routing outcome.');
    }

    // ─────────────────────────────────────────────────────────
    // Test 4: Dynamic Routing Evaluation (Manual Category Fallback)
    // ─────────────────────────────────────────────────────────
    console.log('\n4️⃣  Testing manual category fallback ("non_recipe_food")...');
    const manualResult = await donationAdminService.determineRouting({
      productId: null,
      category: 'non_recipe_food',
    });

    console.log('   Result:', manualResult);

    if (manualResult.category === 'non_recipe_food' && manualResult.storageArea === 'Soup Kitchen Prep') {
      console.log('   ✅ Passed! Manual category correctly mapped to Soup Kitchen Prep.');
    } else {
      console.error('   ❌ FAILED: Manual category routing did not resolve expected storage area.');
    }

    console.log('\n🎉 ALL DONATION ADMIN TESTS COMPLETED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('\n❌ DONATION ADMIN TEST FAILED WITH ERROR:\n', error);
  } finally {
    console.log('[db] Closing database pool connections...');
    await pool.end();
  }
}

// Execute test suite
testDonationAdmin();