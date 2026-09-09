// This hook keeps the product-classification fetch, filtering, and pagination logic in one place.
// The page component gets the already filtered result set, so the screen can later switch from
// client-side pagination to a server-side API call without rewriting the whole UI.

import { useCallback, useEffect, useMemo, useState } from 'react';
import donationClassificationAPI from '@/services/donationClassificationAPI';

export default function useDonationClassification() {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyUnclassified, setShowOnlyUnclassified] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingIds, setPendingIds] = useState([]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const nextProducts = await donationClassificationAPI.getProductsWithDefaults();
      setProducts(nextProducts);
      setPage(1);
    } catch (loadError) {
      setError(loadError.message || 'Could not load products.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        product.name?.toLowerCase().includes(normalizedSearch) ||
        product.sku?.toLowerCase().includes(normalizedSearch);

      const matchesView = !showOnlyUnclassified || !product.donation_category;
      return matchesSearch && matchesView;
    });
  }, [products, searchTerm, showOnlyUnclassified]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const currentPage = Math.min(page, totalPages);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const updateCategory = useCallback(async (productId, category) => {
    const normalizedId = Number(productId);

    if (!category || !Number.isFinite(normalizedId)) {
      return false;
    }

    setPendingIds((current) => (current.includes(normalizedId) ? current : [...current, normalizedId]));
    setError('');

    try {
      const updated = await donationClassificationAPI.setProductClassification(normalizedId, category);

      setProducts((currentProducts) =>
        currentProducts.map((product) =>
          product.id === normalizedId
            ? { ...product, donation_category: updated?.donation_category ?? category }
            : product
        )
      );

      return true;
    } catch (updateError) {
      setError(updateError.message || 'Could not update the classification.');
      return false;
    } finally {
      setPendingIds((current) => current.filter((id) => id !== normalizedId));
    }
  }, []);

  const removeCategory = useCallback(async (productId) => {
    const normalizedId = Number(productId);

    setPendingIds((current) => (current.includes(normalizedId) ? current : [...current, normalizedId]));
    setError('');

    try {
      await donationClassificationAPI.removeProductClassification(normalizedId);

      setProducts((currentProducts) =>
        currentProducts.map((product) =>
          product.id === normalizedId ? { ...product, donation_category: null } : product
        )
      );

      return true;
    } catch (removeError) {
      if (removeError.status === 404) {
        setError('This classification was already removed by another admin.');
      } else {
        setError(removeError.message || 'Could not remove the classification.');
      }
      return false;
    } finally {
      setPendingIds((current) => current.filter((id) => id !== normalizedId));
    }
  }, []);

  return {
    products,
    paginatedProducts,
    searchTerm,
    setSearchTerm,
    showOnlyUnclassified,
    setShowOnlyUnclassified,
    isLoading,
    error,
    page,
    setPage,
    totalPages,
    refresh,
    updateCategory,
    removeCategory,
    pendingIds,
  };
}
