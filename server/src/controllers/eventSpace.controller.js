import eventSpaceService from '../services/eventSpace.service.js';

const listActiveSpaces = async (_req, res, next) => {
  try {
    const spaces = await eventSpaceService.listActiveSpaces();
    res.status(200).json({ success: true, data: spaces });
  } catch (err) {
    next(err);
  }
};

const createSpace = async (req, res, next) => {
  try {
    const space = await eventSpaceService.createSpace(req.body);
    res.status(201).json({ success: true, data: space });
  } catch (err) {
    next(err);
  }
};

export default { listActiveSpaces, createSpace };
