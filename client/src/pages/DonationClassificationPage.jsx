// This page is the admin screen for setting the default donation category for each product.
// It loads the products, lets the admin search, filters only unclassified items, and updates
// the default category in place. The page uses a single hook so the fetch/filter/pagination logic
// is isolated and easy to replace later if the backend starts paginating on the server.
import DonationClassificationTable from '../features/donationAdmin/components/DonationClassificationTable';
import useDonationClassification from '../features/donationAdmin/hooks/useDonationClassification';

export default function DonationClassificationPage() {
  const {
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
    updateCategory,
    removeCategory,
    pendingIds,
  } = useDonationClassification();

  return (
    <div className="min-h-screen bg-[#f8f5f2] text-[#2b3336]">

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b7275]">Admin</p>
            <h1 className="mt-2 text-2xl font-bold text-[#2b3336]">Donation Classification</h1>
          </div>
        </div>

        <DonationClassificationTable
          products={paginatedProducts}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          showOnlyUnclassified={showOnlyUnclassified}
          onShowOnlyUnclassifiedChange={setShowOnlyUnclassified}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onUpdateCategory={updateCategory}
          onRemoveCategory={removeCategory}
          isLoading={isLoading}
          error={error}
          pendingIds={pendingIds}
        />
      </main>
    </div>
  );
}
