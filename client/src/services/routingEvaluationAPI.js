import { apiPost } from './api';

export const ROUTING_CATEGORIES = [
  'recipe_food',
  'add_on_food',
  'non_recipe_food',
  'non_food',
];

export async function evaluateRouting({ productId, category }) {
  const payload = {};

  if (productId !== '' && productId !== null && productId !== undefined) {
    payload.productId = Number(productId);
  }

  if (category) {
    payload.category = category;
  }

  const response = await apiPost('/api/donations/admin/evaluate-routing', payload);
  return response?.data ?? response;
}
