// ─────────────────────────────────────────────────────────────
// server/src/features/warehouseMap/layout.js
//
// Checks a floor plan an admin saves, and puts it in the shape the
// repository writes. The layout builder prevents most of these on
// screen; this is the copy that decides.
//
// A plan is refused, with the reason, when an area has no name or a
// name another area has, is not one of the kinds, falls off the grid,
// overlaps another area, or has a capacity that is not a positive
// number. Overlaps matter because a click on the map has to land on one
// area, and a count has to mean one place.
//
// What does not apply to a kind is dropped rather than refused: a door
// has no capacity or preferred stock, a staging area holds pallets, not
// kilograms, and a dry store has no pallet spaces.
//
// No SQL here.
// ─────────────────────────────────────────────────────────────
import {
  GRID, MAX_AREAS, MAX_CAPACITY_KG, MAX_CATEGORY_LENGTH, MAX_LEVELS, MAX_NAME_LENGTH, MAX_PALLET_SPACES,
  MAX_PREFERENCES, STAGING_KIND, isAreaKind, isStorageKind,
} from '../../constants/warehouseMap.js';

const isWhole = (v) => Number.isInteger(v);
const blank = (v) => v === undefined || v === null || v === '';

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Returns { areas } when the plan is good, or { error } with a sentence
 * saying what to fix.
 */
export const checkLayout = (input) => {
  if (!Array.isArray(input)) return { error: 'Send the plan as a list of areas.' };
  if (input.length > MAX_AREAS) return { error: `A plan can have up to ${MAX_AREAS} areas.` };

  const areas = [];
  const names = new Map();
  for (const [index, raw] of input.entries()) {
    const id = blank(raw?.id) ? null : Number(raw.id);
    if (id !== null && !(isWhole(id) && id > 0)) return { error: `Area ${index + 1} has an id that is not valid.` };

    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    if (!name) return { error: `Give area ${index + 1} a name.` };
    if (name.length > MAX_NAME_LENGTH) return { error: `"${name}" is longer than ${MAX_NAME_LENGTH} characters.` };
    const key = name.toLowerCase();
    if (names.has(key)) return { error: `Two areas are called "${name}". Give each its own name.` };
    names.set(key, name);

    if (!isAreaKind(raw?.kind)) return { error: `Choose dry store, cold room, floor, pallet staging or door for "${name}".` };
    const storage = isStorageKind(raw.kind);
    const staging = raw.kind === STAGING_KIND;

    const [x, y, w, h] = [raw.x, raw.y, raw.w, raw.h].map(Number);
    if (![x, y, w, h].every(isWhole) || x < 0 || y < 0 || w < 1 || h < 1) {
      return { error: `"${name}" needs a whole-number position and a size of at least one square.` };
    }
    if (x + w > GRID.cols || y + h > GRID.rows) return { error: `"${name}" runs off the edge of the plan.` };

    const levels = blank(raw.levels) ? 1 : Number(raw.levels);
    if (!isWhole(levels) || levels < 1 || levels > MAX_LEVELS) {
      return { error: `"${name}" can be 1 to ${MAX_LEVELS} levels high.` };
    }

    let capacityKg = null;
    if (storage && !blank(raw.capacityKg)) {
      capacityKg = Number(raw.capacityKg);
      if (!Number.isFinite(capacityKg) || capacityKg <= 0 || capacityKg > MAX_CAPACITY_KG) {
        return { error: `Enter a capacity above 0 kg for "${name}", or leave it empty.` };
      }
    }

    let palletSpaces = null;
    if (staging && !blank(raw.palletSpaces)) {
      palletSpaces = Number(raw.palletSpaces);
      if (!isWhole(palletSpaces) || palletSpaces < 1 || palletSpaces > MAX_PALLET_SPACES) {
        return { error: `Enter 1 to ${MAX_PALLET_SPACES} pallet spaces for "${name}", or leave it empty.` };
      }
    }

    const ids = storage && Array.isArray(raw.preferredProductIds) ? raw.preferredProductIds.map(Number) : [];
    if (!ids.every((n) => isWhole(n) && n > 0)) return { error: `"${name}" has a preferred product that is not valid.` };
    const categories = storage && Array.isArray(raw.preferredCategories)
      ? raw.preferredCategories.map((c) => String(c ?? '').trim()).filter(Boolean)
      : [];
    if (categories.some((c) => c.length > MAX_CATEGORY_LENGTH)) return { error: `"${name}" has a category name that is too long.` };
    const preferredProductIds = [...new Set(ids)];
    const preferredCategories = [...new Map(categories.map((c) => [c.toLowerCase(), c])).values()];
    if (preferredProductIds.length + preferredCategories.length > MAX_PREFERENCES) {
      return { error: `"${name}" can have up to ${MAX_PREFERENCES} preferred products and categories.` };
    }

    areas.push({
      id, name, kind: raw.kind, x, y, w, h, levels, capacityKg, palletSpaces, preferredProductIds, preferredCategories,
    });
  }

  for (let i = 0; i < areas.length; i += 1) {
    for (let j = i + 1; j < areas.length; j += 1) {
      if (overlaps(areas[i], areas[j])) {
        return { error: `"${areas[i].name}" and "${areas[j].name}" overlap. Move one of them.` };
      }
    }
  }

  return { areas };
};

export default { checkLayout };
