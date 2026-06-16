import deliveryService from '../services/delivery.service.js';

// GET /api/deliveries?range=today|week|month|all
const getDeliveries = async (req, res) => {
  try {
    const range     = req.query.range || 'all';
    const deliveries = await deliveryService.getDeliveries(range);
    res.json({ success: true, data: deliveries });
  } catch (err) {
    console.error('[getDeliveries]', err.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve deliveries.' });
  }
};

// GET /api/deliveries/:id
const getDeliveryById = async (req, res) => {
  try {
    const delivery = await deliveryService.getDeliveryById(req.params.id);
    res.json({ success: true, data: delivery });
  } catch (err) {
    console.error('[getDeliveryById]', err.message);
    const status = err.message === 'Delivery not found.' ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// POST /api/deliveries
const createDelivery = async (req, res) => {
  try {
    const delivery = await deliveryService.createDelivery(req.body, req.user.id);
    res.status(201).json({ success: true, data: delivery });
  } catch (err) {
    console.error('[createDelivery]', err.message);
    const status = err.message.includes('required') ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// GET /api/deliveries/suppliers
const getSuppliers = async (req, res) => {
  try {
    const suppliers = await deliveryService.getSuppliers();
    res.json({ success: true, data: suppliers });
  } catch (err) {
    console.error('[getSuppliers]', err.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve suppliers.' });
  }
};

// GET /api/deliveries/drivers?supplierId=1
const getDrivers = async (req, res) => {
  try {
    const drivers = await deliveryService.getDrivers(req.query.supplierId);
    res.json({ success: true, data: drivers });
  } catch (err) {
    console.error('[getDrivers]', err.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve drivers.' });
  }
};

// GET /api/deliveries/products
const getProducts = async (req, res) => {
  try {
    const products = await deliveryService.getProducts();
    res.json({ success: true, data: products });
  } catch (err) {
    console.error('[getProducts]', err.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve products.' });
  }
};

// GET /api/deliveries/purchase-orders?supplierId=1
const getPurchaseOrders = async (req, res) => {
  try {
    const orders = await deliveryService.getPurchaseOrdersBySupplier(req.query.supplierId);
    res.json({ success: true, data: orders });
  } catch (err) {
    console.error('[getPurchaseOrders]', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// GET /api/deliveries/purchase-orders/:id/items
const getPurchaseOrderItems = async (req, res) => {
  try {
    const items = await deliveryService.getPurchaseOrderItems(req.params.id);
    res.json({ success: true, data: items });
  } catch (err) {
    console.error('[getPurchaseOrderItems]', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

export default {
  getDeliveries,
  getDeliveryById,
  createDelivery,
  getSuppliers,
  getDrivers,
  getProducts,
  getPurchaseOrders,
  getPurchaseOrderItems,
};