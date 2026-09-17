import eventSpaceRepository from '../repositories/eventSpace.repository.js';

// This HTTP slice intentionally exposes active spaces only. Space lifecycle
// management remains outside the Volunteer Management API.
const listActiveSpaces = async () => eventSpaceRepository.findAll({ isActive: true });

const createSpace = async (data) => {
  const spaceName = String(data?.spaceName ?? '').trim();
  const location = String(data?.location ?? '').trim();
  if (!spaceName) {
    const error = new Error('Space name is required.'); error.status = 400; throw error;
  }
  if (spaceName.length > 200 || location.length > 255) {
    const error = new Error('Space name or location is too long.'); error.status = 400; throw error;
  }
  const existing = await eventSpaceRepository.findByName(spaceName);
  if (existing) {
    const error = new Error('An event space with this name already exists.'); error.status = 409; throw error;
  }
  try {
    return await eventSpaceRepository.createSpace({ spaceName, location: location || null, description: null, is_active: true });
  } catch (error) {
    if (error.code === '23505') {
      const conflict = new Error('An event space with this name already exists.'); conflict.status = 409; throw conflict;
    }
    throw error;
  }
};

export default { listActiveSpaces, createSpace };
export { listActiveSpaces, createSpace };
