import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import RoutingDecisionTrail from '../features/donationAdmin/components/RoutingDecisionTrail';
import { ROUTING_CATEGORIES, evaluateRouting } from '../services/routingEvaluationAPI';

const formatCategoryLabel = (category) => category?.replace(/_/g, ' ') || '—';

function buildDecisionTrail({ productId, category, result }) {
  const hasProduct = productId !== '' && productId !== null && productId !== undefined;
  const hasCategory = Boolean(category && String(category).trim());

  if (!result) {
    return {
      steps: [],
      summary: '',
    };
  }

  if (result.source === 'product_default') {
    return {
      steps: [
        {
          label: hasProduct
            ? `1. Checked product #${productId} for a preset default → ✓ Found: ${result.category}`
            : '1. Checked product for a preset default → ✓ Found: ' + result.category,
        },
      ],
      summary: `Result: routed via PRODUCT DEFAULT (${result.category}, ${result.routing_outcome}, ${result.storage_area})`,
    };
  }

  if (result.source === 'manual_category') {
    return {
      steps: [
        {
          label: hasProduct
            ? `1. Checked product #${productId} for a preset default → ✗ No default set`
            : '1. Checked product for a preset default → ✗ No default set / no product given',
        },
        {
          label: hasCategory
            ? `2. Checked manually-provided category → ✓ Used: ${result.category}`
            : '2. Checked manually-provided category → ✓ Used: ' + result.category,
        },
      ],
      summary: `Result: routed via MANUAL CATEGORY (${result.category}, ${result.routing_outcome}, ${result.storage_area})`,
    };
  }

  return {
    steps: [
      {
        label: hasProduct
          ? `1. Checked product #${productId} for a preset default → ✗ No default set`
          : '1. Checked product for a preset default → ✗ No default set / no product given',
      },
      {
        label: hasCategory
          ? `2. Checked manually-provided category → ✗ No match from this input`
          : '2. Checked manually-provided category → ✗ None provided',
      },
    ],
    summary: 'Result: UNCLASSIFIED — flagged for manual review',
  };
}

export default function EvaluateRoutingPage() {
  const [productId, setProductId] = useState('');
  const [category, setCategory] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const trail = useMemo(
    () => buildDecisionTrail({ productId, category, result }),
    [productId, category, result]
  );

  const handleEvaluate = async () => {
    setError('');

    if (productId !== '' && productId !== null && productId !== undefined) {
      const parsedProductId = Number(productId);
      if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
        setError('Product ID must be a valid positive integer.');
        setResult(null);
        return;
      }
    }

    try {
      setLoading(true);
      const payload = {
        productId: productId === '' ? undefined : Number(productId),
        category: category || undefined,
      };
      const response = await evaluateRouting(payload);
      setResult(response);
    } catch (err) {
      setResult(null);
      setError(err?.response?.data?.message || err?.message || 'Unable to evaluate routing right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f5f2] text-[#2b3336]">

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b7275]">Admin</p>
            <h1 className="mt-2 text-2xl font-bold text-[#2b3336]">Explain Donation Routing</h1>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="space-y-5">
              <div>
                <label htmlFor="productId" className="mb-2 block text-sm font-medium text-slate-700">
                  Product ID
                </label>
                <Input
                  id="productId"
                  type="number"
                  min="1"
                  placeholder="e.g. 104"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                />
              </div>

              <div>
                <label htmlFor="category" className="mb-2 block text-sm font-medium text-slate-700">
                  Category
                </label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category" className="w-full">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTING_CATEGORIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {formatCategoryLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleEvaluate} disabled={loading} className="w-full">
                {loading ? 'Evaluating...' : 'Evaluate / Explain'}
              </Button>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {!result && !error && (
              <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                Enter a product ID, choose a category, or use both to preview the routing logic.
              </div>
            )}

            {result && <RoutingDecisionTrail steps={trail.steps} summary={trail.summary} />}
          </div>
        </div>
      </main>
    </div>
  );
}
