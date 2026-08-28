// This table renders the product default-classification list and keeps the editing UI inline.
// Each row can set a new category, change an existing one, or confirm a delete before the API call runs.

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PRODUCT_CLASSIFICATION_CATEGORIES } from '@/services/donationClassificationAPI';

const formatCategoryLabel = (category = '') =>
  category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function DonationClassificationTable({
  products,
  searchTerm,
  onSearchChange,
  showOnlyUnclassified,
  onShowOnlyUnclassifiedChange,
  page,
  totalPages,
  onPageChange,
  onUpdateCategory,
  onRemoveCategory,
  isLoading,
  error,
  pendingIds,
}) {
  const [draftSelections, setDraftSelections] = useState({});
  const [confirmRemoveRow, setConfirmRemoveRow] = useState(null);

  const handleSelection = (productId, value) => {
    setDraftSelections((current) => ({
      ...current,
      [productId]: value,
    }));
  };

  const handleSave = async (productId, value) => {
    const nextValue = value || draftSelections[productId];
    if (!nextValue) return;

    const didUpdate = await onUpdateCategory(productId, nextValue);
    if (didUpdate) {
      setDraftSelections((current) => ({
        ...current,
        [productId]: undefined,
      }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[12px] border border-[#e9e3dd] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Input
            aria-label="Search products"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search product or SKU"
            className="bg-[#f8f5f2]"
          />
        </div>

        <div className="inline-flex rounded-full border border-[#d9d0c8] bg-[#f8f5f2] p-1">
          <Button
            type="button"
            variant={showOnlyUnclassified ? 'ghost' : 'default'}
            size="sm"
            onClick={() => onShowOnlyUnclassifiedChange(false)}
            className={showOnlyUnclassified ? 'text-[#2b3336]' : 'bg-[#2b3336] text-white hover:bg-[#1f2527]'}
          >
            All
          </Button>
          <Button
            type="button"
            variant={showOnlyUnclassified ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onShowOnlyUnclassifiedChange(true)}
            className={!showOnlyUnclassified ? 'text-[#2b3336]' : 'bg-[#2b3336] text-white hover:bg-[#1f2527]'}
          >
            Unclassified only
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-[10px] border border-[#ef3a40] bg-[#fff1f0] px-4 py-3 text-sm text-[#2b3336]">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[12px] border border-[#e9e3dd] bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Current default</TableHead>
              <TableHead className="min-w-[280px]">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-[#6b7275]">
                  Loading products…
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-[#6b7275]">
                  No products match this search.
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => {
                const currentValue = draftSelections[product.id] ?? product.donation_category ?? '';
                const isPending = pendingIds.includes(product.id);

                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium text-[#2b3336]">{product.name}</TableCell>
                    <TableCell className="text-[#2b3336]">{product.sku}</TableCell>
                    <TableCell className="text-[#2b3336]">
                      {product.donation_category ? formatCategoryLabel(product.donation_category) : '— unclassified —'}
                    </TableCell>
                    <TableCell>
                      {product.donation_category ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={currentValue || product.donation_category}
                            onValueChange={(value) => handleSelection(product.id, value)}
                          >
                            <SelectTrigger className="w-[190px] bg-[#f8f5f2]">
                              <SelectValue placeholder="Choose category" />
                            </SelectTrigger>
                            <SelectContent>
                              {PRODUCT_CLASSIFICATION_CATEGORIES.map((category) => (
                                <SelectItem key={category} value={category}>
                                  {formatCategoryLabel(category)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSave(product.id, currentValue || product.donation_category)}
                            disabled={isPending}
                          >
                            Update
                          </Button>

                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => setConfirmRemoveRow(product)}
                            disabled={isPending}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={currentValue || ''}
                            onValueChange={(value) => handleSelection(product.id, value)}
                          >
                            <SelectTrigger className="w-[190px] bg-[#f8f5f2]">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              {PRODUCT_CLASSIFICATION_CATEGORIES.map((category) => (
                                <SelectItem key={category} value={category}>
                                  {formatCategoryLabel(category)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSave(product.id, currentValue)}
                            disabled={!currentValue || isPending}
                          >
                            Set classification
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between rounded-[10px] border border-[#e9e3dd] bg-white px-4 py-3 text-sm text-[#2b3336] shadow-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>

          <span>
            Page {page} of {totalPages}
          </span>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      <AlertDialog open={Boolean(confirmRemoveRow)} onOpenChange={(open) => !open && setConfirmRemoveRow(null)}>
        <AlertDialogContent className="max-w-md rounded-[12px] border border-[#e9e3dd] bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove default classification?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the preset category for <strong>{confirmRemoveRow?.name}</strong>. It will not delete the product itself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmRemoveRow) return;
                const didRemove = await onRemoveCategory(confirmRemoveRow.id);
                if (didRemove) {
                  setConfirmRemoveRow(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
