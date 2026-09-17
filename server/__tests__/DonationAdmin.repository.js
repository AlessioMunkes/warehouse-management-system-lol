// ─────────────────────────────────────────────────────────────
// server/__tests__/DonationAdmin.repository.js
// ─────────────────────────────────────────────────────────────

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env or .env.local from the server directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import pool from '../src/config/db.js';
import productRepo from '../src/repositories/product.repository.js';
import classificationRepo from '../src/repositories/donation.classification.js';

async function testRepositories() {
  console.log('\n🚀 Starting Repository Verification Tests...\n');

  try {
    // 1. Test Category Routing Rules (donation.classification.js)
    console.log('1️⃣  Testing getAllCategoryRoutings()...');
    const categories = await classificationRepo.getAllCategoryRoutings();
    console.log(`   Found ${categories.length} category rules in DB:`);
    categories.forEach((cat) => {
      console.log(`   - [${cat.category}] Outcome: ${cat.routing_outcome} | Storage: ${cat.storage_area || 'None'}`);
    });

    console.log('\n2️⃣  Testing getRoutingByCategory("recipe_food")...');
    const recipeRule = await classificationRepo.getRoutingByCategory('recipe_food');
    console.log('   Rule result:', recipeRule);

    // 2. Test Product Classification Defaults (product.repository.js)
    console.log('\n3️⃣  Testing getAllProductsWithDefaults()...');
    const products = await productRepo.getAllProductsWithDefaults();
    console.log(`   Found ${products.length} products in catalog.`);

    if (products.length > 0) {
      const testProduct = products[0];
      console.log(`\n4️⃣  Testing getProductRoutingDefault() for Product ID: ${testProduct.id} (${testProduct.name})...`);
      const defaultRouting = await productRepo.getProductRoutingDefault(testProduct.id);
      console.log('   Default routing:', defaultRouting || 'No category preset yet (unclassified)');
    } else {
      console.log('\n⚠️  No products found in database to test individual product lookups.');
    }

    console.log('\n ✅ ALL REPOSITORY READ TESTS PASSED LOCALLY!\n');
  } catch (error) {
    console.error('\n ❌ REPOSITORY TEST FAILED:\n', error);
  } finally {
    await pool.end();
  }
}

testRepositories();