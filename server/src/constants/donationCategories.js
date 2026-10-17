// ─────────────────────────────────────────────────────────────
// server/src/constants/donationCategories.js
//
// The donation_category vocabulary, in one place, for the same reason
// as storageAreas.js: each module that kept its own copy is a place for
// the lists to drift apart.
//
// These are the four labels of the donation_category enum in the live
// database. Postgres rejects anything else outright, so a value missing
// here is a 500 rather than a clean 400.
// ─────────────────────────────────────────────────────────────

export const DONATION_CATEGORIES = ['recipe_food', 'add_on_food', 'non_recipe_food', 'non_food'];

// The food routes a manager can send a reviewed item down. Non-food has
// its own decision (move_to_non_food) rather than being a route.
export const FOOD_CATEGORIES = ['recipe_food', 'add_on_food', 'non_recipe_food'];

// Food that goes into ECD stock (the stock table). Non-recipe food goes
// to the soup kitchen and non-food is never stock.
export const ECD_STOCK_CATEGORIES = ['recipe_food', 'add_on_food'];

export const isDonationCategory = (value) => DONATION_CATEGORIES.includes(value);

export default { DONATION_CATEGORIES, FOOD_CATEGORIES, ECD_STOCK_CATEGORIES, isDonationCategory };
