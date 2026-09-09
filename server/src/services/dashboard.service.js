// ─────────────────────────────────────────────────────────────
// server/src/services/dashboard.service.js
//
// No validation to do — getSummary takes no input — but kept as its
// own layer rather than having the controller call the repository
// directly, matching every other feature's controller/service/
// repository split.
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/dashboard.repository.js';

const getSummary = async () => repo.getSummary();

export default { getSummary };
