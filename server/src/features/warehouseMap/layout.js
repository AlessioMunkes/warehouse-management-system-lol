// ─────────────────────────────────────────────────────────────
// server/src/features/warehouseMap/layout.js
//
// Checks a floor plan an admin saves, and puts it in the shape the
// repository writes. The layout builder prevents most of these on
// screen; this is the copy that decides.
//
// A plan is refused, with the reason, when an area has no name or a
// name another area has, is not one of the kinds, falls off the grid,
// or overlaps another area. Overlaps matter because a click on the map
// has to land on one area, and a count has to mean one place.
//
// No SQL here.
// ─────────────────────────────────────────────────────────────
import { GRID, MAX_AREAS, MAX_LEVELS, MAX_NAME_LENGTH, isAreaKind } from '../../constants/warehouseMap.js';

const isWhole = (v) => Number.isInteger(v);

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
    const id = raw?.id === undefined || raw?.id === null ? null : Number(raw.id);
    if (id !== null && !(isWhole(id) && id > 0)) return { error: `Area ${index + 1} has an id that is not valid.` };

    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    if (!name) return { error: `Give area ${index + 1} a name.` };
    if (name.length > MAX_NAME_LENGTH) return { error: `"${name}" is longer than ${MAX_NAME_LENGTH} characters.` };
    const key = name.toLowerCase();
    if (names.has(key)) return { error: `Two areas are called "${name}". Give each its own name.` };
    names.set(key, name);

    if (!isAreaKind(raw?.kind)) return { error: `Choose dry store, cold room, floor or door for "${name}".` };

    const [x, y, w, h] = [raw.x, raw.y, raw.w, raw.h].map(Number);
    if (![x, y, w, h].every(isWhole) || x < 0 || y < 0 || w < 1 || h < 1) {
      return { error: `"${name}" needs a whole-number position and a size of at least one square.` };
    }
    if (x + w > GRID.cols || y + h > GRID.rows) return { error: `"${name}" runs off the edge of the plan.` };

    const levels = raw.levels === undefined || raw.levels === null ? 1 : Number(raw.levels);
    if (!isWhole(levels) || levels < 1 || levels > MAX_LEVELS) {
      return { error: `"${name}" can be 1 to ${MAX_LEVELS} levels high.` };
    }

    areas.push({ id, name, kind: raw.kind, x, y, w, h, levels });
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
