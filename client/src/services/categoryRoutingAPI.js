// This service keeps the donation admin API calls in one place.
// It wraps the authenticated get and patch requests used by the category routing screen,
// so the page code stays readable and follows the same pattern as the rest of the app.
import { apiGet, apiPatch } from './api';

const categoryRoutingAPI = {
  async getCategoryRules() {
    const body = await apiGet('/api/donations/admin/category-routing');
    return body.data || [];
  },

  async updateCategoryRule(category, payload) {
    const body = await apiPatch(`/api/donations/admin/category-routing/${category}`, payload);
    return body.data;
  },
};

export default categoryRoutingAPI;
