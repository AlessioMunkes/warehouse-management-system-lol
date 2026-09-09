// This page is the admin screen for managing the donation category routing rules.
// It loads the four rules from the server, shows them in a table, and lets an admin
// edit one row inline without opening a popup. The top navigation is included so this
// screen matches the rest of the app and feels like part of the admin area.
import { useEffect, useState } from 'react';
import CategoryRoutingEditor from '../features/donationAdmin/components/CategoryRoutingEditor';
import CategoryRoutingTable from '../features/donationAdmin/components/CategoryRoutingTable';
import categoryRoutingAPI from '../services/categoryRoutingAPI';

const createDraftFromRule = (rule) => ({
  routing_outcome: rule?.routing_outcome ?? '',
  storage_area: rule?.storage_area ?? '',
  description: rule?.description ?? '',
});

export default function CategoryRoutingRulesPage() {
  const [rules, setRules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [editingRule, setEditingRule] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState('');

  const loadRules = async () => {
    setPageError('');
    try {
      const nextRules = await categoryRoutingAPI.getCategoryRules();
      setRules(nextRules);
    } catch (error) {
      setPageError(error.message || 'Could not load category routing rules.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const nextRules = await categoryRoutingAPI.getCategoryRules();
        if (!cancelled) {
          setRules(nextRules);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error.message || 'Could not load category routing rules.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setDraft(createDraftFromRule(rule));
    setInlineError('');
  };

  const handleCancel = () => {
    setEditingRule(null);
    setDraft({});
    setInlineError('');
  };

  const handleChange = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!editingRule) return;

    setInlineError('');
    setSaving(true);

    try {
      const updatedRule = await categoryRoutingAPI.updateCategoryRule(editingRule.category, {
        routingOutcome: draft.routing_outcome,
        storageArea: draft.storage_area,
        description: draft.description,
      });

      setRules((current) =>
        current.map((rule) => (rule.category === updatedRule.category ? updatedRule : rule))
      );
      setEditingRule(null);
      setDraft({});
    } catch (error) {
      setInlineError(error.message || 'Could not save this routing rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f5f2] text-[#2b3336]">

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b7275]">
              Admin
            </p>
            <h1 className="mt-2 text-2xl font-bold text-[#2b3336]">
              Category Routing Rules
            </h1>
          </div>

          <button
            type="button"
            onClick={loadRules}
            className="inline-flex h-9 items-center justify-center rounded-[999px] border border-[#d9d0c8] bg-white px-4 text-sm font-medium text-[#2b3336] transition hover:bg-[#f5f1ec]"
          >
            Refresh
          </button>
        </div>

        {pageError ? (
          <div className="mb-4 rounded-[8px] border border-[#ef3a40] bg-[#fff1f0] px-4 py-3 text-sm text-[#2b3336]">
            {pageError}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-[8px] border border-[#e9e3dd] bg-white p-6 text-sm text-[#5b6367]">
            Loading category routing rules…
          </div>
        ) : (
          <>
            <CategoryRoutingTable rules={rules} onEdit={handleEdit} />

            {editingRule ? (
              <CategoryRoutingEditor
                rule={editingRule}
                draft={draft}
                onChange={handleChange}
                onSave={handleSave}
                onCancel={handleCancel}
                saving={saving}
                error={inlineError}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
