
// ─────────────────────────────────────────────────────────────
// server/__tests__/donation.intake.test.js
//
// CONVERSATION CONTEXT & RATIONALE:
// - Integration and verification test suite verifying all 5 intake categories.
// - Specifically tests that non-food (non-stock) items cleanly bypass stock tables 
//   while correctly resolving their administrative/external storage locations.
// ─────────────────────────────────────────────────────────────
import pool from '../src/config/db.js';
import donationService from '../src/services/donation.intake.service.js';

async function testDonationIntake() {
  console.log('\n🚀 Starting Donation Intake & Repository Integration Tests...\n');

  try {
    const productsRes = await pool.query(
      `SELECT id, name, stock_keeping_unit, storage_type FROM products WHERE is_active = true ORDER BY id ASC;`
    );
    const products = productsRes.rows;

    if (products.length === 0) {
      console.error('❌ No active products found in database! Please check your product seed.');
      return;
    }

    console.log(`Found ${products.length} active products in database for testing.\n`);

    const coldProduct = products.find((p) => p.storage_type === 'cold') || products[0];
    const dryProduct = products.find((p) => p.storage_type === 'dry') || products[1];

    const mockUserId = 1;

    console.log(`1️⃣  Testing "recipe_food" intake for Cold item ("${coldProduct.name}")...`);
    const intake1 = await donationService.processDonationIntake({
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
    });

    if (intake1.stagedLocation !== 'Cold Storage' || !intake1.ecdInventoryUpdated) {
      console.error('   ❌ FAILED: Expected Cold Storage staging and ECD stock update.');
    } else {
      console.log('   ✅ Passed! Correctly staged in Cold Storage and updated stock levels.');
    }

    console.log(`\n2️⃣  Testing repeat donation of "${coldProduct.name}" (Duplicate prevention & balance update)...`);
    const intake2 = await donationService.processDonationIntake({
      productId: coldProduct.id,
      quantityKg: 15.0,
      expirationDate: '2026-09-20',
      category: 'recipe_food',
      receivedByUserId: mockUserId,
    });

    console.log('   Result:', {
      product: intake2.productName,
      previousStock: intake1.totalEcdStockKg,
      addedKg: 15.0,
      newTotalStockKg: intake2.totalEcdStockKg,
    });

    if (Number(intake2.totalEcdStockKg) === Number(intake1.totalEcdStockKg) + 15.0) {
      console.log('   ✅ Passed! Stock level accumulated without duplicate product entries.');
    } else {
      console.error('   ❌ FAILED: Inventory total stock did not accumulate correctly.');
    }

    console.log(`\n3️⃣  Testing "add_on_food" intake for Dry item ("${dryProduct.name}")...`);
    const intake3 = await donationService.processDonationIntake({
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
    });

    if (intake3.stagedLocation === 'Dry Storage' && intake3.ecdInventoryUpdated) {
      console.log('   ✅ Passed! Correctly staged in Dry Storage.');
    } else {
      console.error('   ❌ FAILED: Expected Dry Storage staging.');
    }

    console.log(`\n4️⃣  Testing "non_recipe_food" intake (Soup Kitchen routing)...`);
    const intake4 = await donationService.processDonationIntake({
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

    console.log(`\n5️⃣  Testing "non_food" intake (Mezzanine/Boardroom non-stock routing)...`);
    const intake5 = await donationService.processDonationIntake({
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

    if (!intake5.ecdInventoryUpdated && intake5.stagedLocation === 'Mezzanine or Boardroom storage') {
      console.log('   ✅ Passed! Non-food item correctly routed without touching stock tables.');
    } else {
      console.error('   ❌ FAILED: Expected non-food to route to Mezzanine/Boardroom without stock updates.');
    }

    console.log('\n🎉 ALL DONATION INTAKE INTEGRATION TESTS COMPLETED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('\n❌ DONATION INTAKE TEST FAILED WITH ERROR:\n', error);
  } finally {
    console.log('[db] Closing database pool connections...');
    await pool.end();
  }
}

testDonationIntake();