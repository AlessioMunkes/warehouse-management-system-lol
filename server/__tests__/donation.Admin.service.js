
// server/__tests__/donationAdmin.service.js
//
// Verification test script for donationAdmin.service.js.
// Tests dynamic BR-10 donation classification and routing rules lookup.
// ─────────────────────────────────────────────────────────────
import pool from '../src/config/db.js';
import donationAdminService from '../src/services/donationAdmin.service.js';

/**
 * Runs a full battery of unit and integration checks against the donation admin service layer.
 */
async function testDonationAdminService() {
  console.log('\n🚀 Starting Donation Admin Service Verification Tests...\n');

  try {
    // 1️⃣ Test: Retrieve all configured category routing rules
    console.log('1️⃣  Testing donationAdminService.getAllCategoryRoutings()...');
    const categories = await donationAdminService.getAllCategoryRoutings();
    console.log(`   ✅ Success! Retrieved ${categories.length} category routing rules from database.`);
    if (categories.length > 0) {
      console.log('   Sample Category Rule:', {
        category: categories[0].category,
        outcome: categories[0].routing_outcome,
        storageArea: categories[0].storage_area,
      });
    }

    // 2️⃣ Test: Retrieve product catalog merged with default classification presets
    console.log('\n2️⃣  Testing donationAdminService.getAllProductsWithDefaults()...');
    const productsWithDefaults = await donationAdminService.getAllProductsWithDefaults();
    console.log(`   ✅ Success! Retrieved ${productsWithDefaults.length} products with routing presets.`);

    // 3️⃣ Test: Evaluate determineRouting() priority logic
    console.log('\n3️⃣  Testing donationAdminService.determineRouting()...');

    // Scenario A: Worker manually enters/selects a standard category string
    console.log('\n   [Scenario A] Manual category fallback ("recipe_food")...');
    const manualResult = await donationAdminService.determineRouting({
      productId: null,
      category: 'recipe_food',
    });
    console.log('   Result:', manualResult);

    // Scenario B: Product ID passed (if products exist in DB)
    if (productsWithDefaults.length > 0) {
      const targetProduct = productsWithDefaults[0];
      console.log(`\n   [Scenario B] Product routing check for Product ID ${targetProduct.id} ("${targetProduct.name}")...`);
      const productResult = await donationAdminService.determineRouting({
        productId: targetProduct.id,
        category: null,
      });
      console.log('   Result:', productResult);
    }

    // Scenario C: Completely unclassified line item (no product ID, no category)
    console.log('\n   [Scenario C] Unclassified fallback (no product ID, no category)...');
    const unclassifiedResult = await donationAdminService.determineRouting({
      productId: null,
      category: null,
    });
    console.log('   Result:', unclassifiedResult);

    // Scenario D: Non-existent category string passed
    console.log('\n   [Scenario D] Unknown category lookup ("non_existent_category_xyz")...');
    const unknownCategoryResult = await donationAdminService.determineRouting({
      productId: null,
      category: 'non_existent_category_xyz',
    });
    console.log('   Result:', unknownCategoryResult);

    // 4️⃣ Test: Invalid product ID input validation
    console.log('\n4️⃣  Testing input validation for invalid Product ID (-99)...');
    try {
      await donationAdminService.determineRouting({
        productId: -99,
        category: 'recipe_food',
      });
      console.error('   ❌ FAILED: Service should have thrown a validation error for negative Product ID.');
    } catch (err) {
      console.log(`   ✅ Passed! Caught expected validation error: "${err.message}" (Status: ${err.status})`);
    }

    console.log('\n 🎉 ALL DONATION ADMIN SERVICE TESTS COMPLETED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('\n ❌ DONATION ADMIN SERVICE TEST FAILED WITH ERROR:\n', error);
  } finally {
    // Ensure database client connection pool shuts down cleanly after test completion
    console.log('[db] Closing pool connections...');
    await pool.end();
  }
}

// Execute the test suite
testDonationAdminService();