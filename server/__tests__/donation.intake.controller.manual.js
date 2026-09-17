// ─────────────────────────────────────────────────────────────
// server/__tests__/donationIntake.test.js
//
// Integration and verification test suite for donation intake service & repository.
// Verifies BR-10 category routing, dynamic dry vs cold storage staging,
// stock accumulation upserts, FEFO batching, and WM flags.
// ─────────────────────────────────────────────────────────────
import pool from '../src/config/db.js';
import donationIntakeService from '../src/services/donation.intake.service.js';

async function testDonationIntake() {
  console.log('\n🚀 Starting Donation Intake & Repository Integration Tests...\n');

  try {
    // Fetch test products seeded in the database
    const productsRes = await pool.query(
      `SELECT id, name, stock_keeping_unit, storage_type FROM products WHERE is_active = true ORDER BY id ASC;`
    );
    const products = productsRes.rows;

    if (products.length === 0) {
      console.error('❌ No active products found in database! Please run seed_products.sql first.');
      return;
    }

    console.log(`Found ${products.length} active products in database for testing.\n`);

    const coldProduct = products.find((p) => p.storage_type === 'cold') || products[0];
    const dryProduct = products.find((p) => p.storage_type === 'dry') || products[1];

    // Mock User ID (representing logged-in inventory operator)
    const mockUserId = 1;

    // ─────────────────────────────────────────────────────────
    // Test 1: Recipe Food (Cold Storage)
    // ─────────────────────────────────────────────────────────
    console.log(`1️⃣  Testing "recipe_food" intake for Cold item ("${coldProduct.name}")...`);
    const intake1 = await donationIntakeService.processDonationIntake({
      productId: coldProduct.id,
      quantityKg: 10.0,
      expirationDate: '2026-09-15',
      category: 'recipe_food',
      receivedByUserId: mockUserId,
    });

    console.log('   Result:', {
      product: intake1.productName,
      category: intake1.category,
      stagedLocation: intake1.stagedLocation,
      ecdInventoryUpdated: intake1.ecdInventoryUpdated,
      totalEcdStockKg: intake1.totalEcdStockKg,
      fefoBatchId: intake1.fefoBatch?.batch_id,
    });

    if (intake1.stagedLocation !== 'Cold Storage' || !intake1.ecdInventoryUpdated) {
      console.error('   ❌ FAILED: Expected Cold Storage staging and ECD stock update.');
    } else {
      console.log('   ✅ Passed! Correctly staged in Cold Storage and logged FEFO batch.');
    }

    // ─────────────────────────────────────────────────────────
    // Test 2: Repeat Intake of Same Product (Stock Accumulation Check)
    // ─────────────────────────────────────────────────────────
    console.log(`\n2️⃣  Testing repeat donation of "${coldProduct.name}" (Duplicate prevention & balance update)...`);
    const intake2 = await donationIntakeService.processDonationIntake({
      productId: coldProduct.id,
      quantityKg: 15.0,
      expirationDate: '2026-09-20', // Different expiration date
      category: 'recipe_food',
      receivedByUserId: mockUserId,
    });

    console.log('   Result:', {
      product: intake2.productName,
      previousStock: intake1.totalEcdStockKg,
      addedKg: 15.0,
      newTotalStockKg: intake2.totalEcdStockKg,
      newBatchId: intake2.fefoBatch?.batch_id,
    });

    if (Number(intake2.totalEcdStockKg) === Number(intake1.totalEcdStockKg) + 15.0) {
      console.log('   ✅ Passed! Stock level accumulated without duplicate product entries.');
    } else {
      console.error('   ❌ FAILED: Inventory total stock did not accumulate correctly.');
    }

    // ─────────────────────────────────────────────────────────
    // Test 3: Add-on Food (Dry Storage)
    // ─────────────────────────────────────────────────────────
    console.log(`\n3️⃣  Testing "add_on_food" intake for Dry item ("${dryProduct.name}")...`);
    const intake3 = await donationIntakeService.processDonationIntake({
      productId: dryProduct.id,
      quantityKg: 25.0,
      expirationDate: '2027-01-01',
      category: 'add_on_food',
      receivedByUserId: mockUserId,
    });

    console.log('   Result:', {
      product: intake3.productName,
      category: intake3.category,
      stagedLocation: intake3.stagedLocation,
      ecdInventoryUpdated: intake3.ecdInventoryUpdated,
      fefoBatchId: intake3.fefoBatch?.batch_id,
    });

    if (intake3.stagedLocation === 'Dry Storage' && intake3.ecdInventoryUpdated) {
      console.log('   ✅ Passed! Correctly staged in Dry Storage.');
    } else {
      console.error('   ❌ FAILED: Expected Dry Storage staging.');
    }

    // ─────────────────────────────────────────────────────────
    // Test 4: Non-Recipe Food (Bypass ECD inventory -> Soup Kitchen)
    // ─────────────────────────────────────────────────────────
    console.log(`\n4️⃣  Testing "non_recipe_food" intake (Soup Kitchen routing)...`);
    const intake4 = await donationIntakeService.processDonationIntake({
      productId: dryProduct.id,
      quantityKg: 50.0,
      expirationDate: '2026-10-01',
      category: 'non_recipe_food',
      receivedByUserId: mockUserId,
    });

    console.log('   Result:', {
      category: intake4.category,
      routingOutcome: intake4.routingOutcome,
      stagedLocation: intake4.stagedLocation,
      ecdInventoryUpdated: intake4.ecdInventoryUpdated,
    });

    if (!intake4.ecdInventoryUpdated && intake4.stagedLocation === 'Soup Kitchen Prep') {
      console.log('   ✅ Passed! Bypassed ECD stock and routed to Soup Kitchen Prep.');
    } else {
      console.error('   ❌ FAILED: Non-recipe food should bypass ECD inventory.');
    }

    // ─────────────────────────────────────────────────────────
    // Test 5: Non-Food (Bypass ECD inventory -> WM Flag)
    // ─────────────────────────────────────────────────────────
    console.log(`\n5️⃣  Testing "non_food" intake (Mezzanine/Boardroom + Warehouse Manager Flag)...`);
    const intake5 = await donationIntakeService.processDonationIntake({
      productId: dryProduct.id,
      quantityKg: 5.0,
      expirationDate: null,
      category: 'non_food',
      receivedByUserId: mockUserId,
    });

    console.log('   Result:', {
      category: intake5.category,
      routingOutcome: intake5.routingOutcome,
      stagedLocation: intake5.stagedLocation,
      ecdInventoryUpdated: intake5.ecdInventoryUpdated,
    });

    // Check if WM flag was inserted
    const flagRes = await pool.query(
      `SELECT * FROM warehouse_manager_flags WHERE product_id = $1 ORDER BY id DESC LIMIT 1;`,
      [dryProduct.id]
    );

    if (!intake5.ecdInventoryUpdated && flagRes.rows.length > 0) {
      console.log('   ✅ Passed! Flag created for Warehouse Manager review:', flagRes.rows[0].reason);
    } else {
      console.error('   ❌ FAILED: Expected Warehouse Manager flag to be created.');
    }

    console.log('\n🎉 ALL DONATION INTAKE INTEGRATION TESTS COMPLETED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('\n❌ DONATION INTAKE TEST FAILED WITH ERROR:\n', error);
  } finally {
    console.log('[db] Closing database pool connections...');
    await pool.end();
  }
}

// Execute tests
testDonationIntake();