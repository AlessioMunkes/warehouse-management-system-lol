import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
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
import ListCard from '@/components/ui/list-card';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import OperationalGoalDialog from '../features/operationalGoals/components/OperationalGoalDialog';
import OperationalGoalAIAssistDialog from '../features/operationalGoals/components/OperationalGoalAIAssistDialog';
import OperationalGoalProgressDialog from '../features/operationalGoals/components/OperationalGoalProgressDialog';
import { OPERATIONAL_GOAL_METRICS } from '../features/operationalGoals/components/operationalGoalMetrics';
import OperationalGoalList from '../features/operationalGoals/components/OperationalGoalList';
import operationalGoalsAPI from '../services/operationalGoalsAPI';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'ALL', label: 'All statuses' },
];

const SORT_OPTIONS = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'period_end_asc', label: 'Period ending soon' },
  { value: 'title_asc', label: 'Goal name A-Z' },
];

const domainOptions = ['ALL', ...Array.from(new Set(OPERATIONAL_GOAL_METRICS.map((metric) => metric.domain)))];
const metricsById = new Map(OPERATIONAL_GOAL_METRICS.map((metric) => [metric.id, metric]));

const searchableText = (goal) => [
  goal.title,
  goal.goalText,
  goal.metricId,
  metricsById.get(goal.metricId)?.label,
  metricsById.get(goal.metricId)?.domain,
  goal.goalType,
  goal.direction,
  goal.comparisonType,
].join(' ').toLowerCase();

const compareDate = (value) => (value ? String(value).slice(0, 10) : '9999-12-31');

export default function OperationalGoalsPage() {
  const [goals, setGoals] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [sort, setSort] = useState('created_desc');
  const [creationView, setCreationView] = useState('dashboard');
  const [editingGoal, setEditingGoal] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [progressGoal, setProgressGoal] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [aiProgressInsight, setAiProgressInsight] = useState(null);
  const [aiProgressLoading, setAiProgressLoading] = useState(false);
  const [aiProgressError, setAiProgressError] = useState('');
  const [askWhyOpen, setAskWhyOpen] = useState(false);
  const [askWhyData, setAskWhyData] = useState(null);
  const [askWhyLoading, setAskWhyLoading] = useState(false);
  const [askWhyError, setAskWhyError] = useState('');
  const [archiveGoal, setArchiveGoal] = useState(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [draftGoal, setDraftGoal] = useState(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = statusFilter === 'ALL' ? {} : { goal_state: statusFilter };
      setGoals(await operationalGoalsAPI.getOperationalGoals(params));
    } catch (err) {
      setError(err.message || 'Could not load operational goals.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadGoals();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadGoals]);

  const visibleGoals = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = goals.filter((goal) => {
      const metric = metricsById.get(goal.metricId);
      if (domainFilter !== 'ALL' && metric?.domain !== domainFilter) return false;
      if (!query) return true;
      return searchableText(goal).includes(query);
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'period_end_asc') return compareDate(a.periodEnd).localeCompare(compareDate(b.periodEnd));
      if (sort === 'title_asc') return String(a.title).localeCompare(String(b.title));
      return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
    });
  }, [domainFilter, goals, search, sort]);

  const openCreateDialog = () => {
    setEditingGoal(null);
    setDraftGoal(null);
    setDialogError('');
    setAiError('');
    setCreationView('create');
  };

  const openEditDialog = (goal) => {
    setEditingGoal(goal);
    setDraftGoal(null);
    setDialogError('');
    setCreationView('edit');
  };

  const saveGoal = async (payload) => {
    setDialogBusy(true);
    setDialogError('');
    try {
      const savedGoal = editingGoal?.id
        ? await operationalGoalsAPI.updateOperationalGoal(editingGoal.id, payload)
        : await operationalGoalsAPI.createOperationalGoal(payload);
      setEditingGoal(null);
      setDraftGoal(null);
      await loadGoals();
      setProgressGoal(savedGoal);
      setProgressData(null);
      setProgressError('');
      setAiProgressInsight(null);
      setAiProgressError('');
      setAskWhyOpen(false);
      setAskWhyData(null);
      setAskWhyError('');
      setCreationView('progress');
      void loadProgress(savedGoal);
      void loadAIProgressInsight(savedGoal);
    } catch (err) {
      setDialogError(err.message || 'Could not save operational goal.');
    } finally {
      setDialogBusy(false);
    }
  };

  const loadProgress = useCallback(async (goal) => {
    if (!goal?.id) return;
    setProgressLoading(true);
    setProgressError('');
    try {
      setProgressData(await operationalGoalsAPI.getOperationalGoalProgress(goal.id));
    } catch (err) {
      setProgressError(err.message || 'Could not load goal progress.');
    } finally {
      setProgressLoading(false);
    }
  }, []);

  const loadAIProgressInsight = useCallback(async (goal) => {
    if (!goal?.id) return;
    setAiProgressLoading(true);
    setAiProgressError('');
    try {
      setAiProgressInsight(await operationalGoalsAPI.explainOperationalGoalWithAI(goal.id));
    } catch (err) {
      setAiProgressError(err.message || 'AI insight is unavailable. The progress summary is still shown.');
    } finally {
      setAiProgressLoading(false);
    }
  }, []);

  const loadAskWhy = useCallback(async (goal) => {
    if (!goal?.id) return;
    setAskWhyOpen(true);
    setAskWhyLoading(true);
    setAskWhyError('');
    try {
      setAskWhyData(await operationalGoalsAPI.askWhyOperationalGoalWithAI(goal.id));
    } catch (err) {
      setAskWhyError(err.message || 'Ask Why is unavailable. The progress summary is still shown.');
    } finally {
      setAskWhyLoading(false);
    }
  }, []);

  const openProgressDialog = (goal) => {
    setProgressGoal(goal);
    setProgressData(null);
    setProgressError('');
    setAiProgressInsight(null);
    setAiProgressError('');
    setAskWhyOpen(false);
    setAskWhyData(null);
    setAskWhyError('');
    setCreationView('progress');
    void loadProgress(goal);
    void loadAIProgressInsight(goal);
  };

  const confirmArchive = async () => {
    if (!archiveGoal?.id) return;
    setArchiveBusy(true);
    setArchiveError('');
    try {
      await operationalGoalsAPI.archiveOperationalGoal(archiveGoal.id);
      setArchiveGoal(null);
      await loadGoals();
    } catch (err) {
      setArchiveError(err.message || 'Could not archive operational goal.');
    } finally {
      setArchiveBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget?.id) return;
    setRestoreBusy(true);
    setRestoreError('');
    try {
      await operationalGoalsAPI.restoreOperationalGoal(restoreTarget.id);
      setRestoreTarget(null);
      await loadGoals();
    } catch (err) {
      setRestoreError(err.message || 'Could not restore operational goal.');
    } finally {
      setRestoreBusy(false);
    }
  };

  const draftWithAI = async (goalText) => {
    setAiBusy(true);
    setAiError('');
    try {
      return await operationalGoalsAPI.draftOperationalGoalWithAI(goalText);
    } catch (err) {
      setAiError(err.message || 'Could not draft an operational goal.');
      return null;
    } finally {
      setAiBusy(false);
    }
  };

  const useAIDraft = (draft) => {
    setDraftGoal(draft);
    setEditingGoal(null);
    setDialogError('');
    setCreationView('review');
  };

  const showDashboard = creationView === 'dashboard';
  const cancelCreateFlow = () => {
    if (dialogBusy || aiBusy) return;
    setCreationView('dashboard');
    setEditingGoal(null);
    setDraftGoal(null);
    setDialogError('');
    setAiError('');
  };

  const returnToDashboard = () => {
    setCreationView('dashboard');
    setProgressGoal(null);
    setEditingGoal(null);
    setProgressData(null);
    setProgressError('');
    setAiProgressInsight(null);
    setAiProgressError('');
    setAskWhyOpen(false);
    setAskWhyData(null);
    setAskWhyError('');
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <PageShell>
        {showDashboard ? (
        <>
        <PageHeader
          title="Operational Goals"
          description="Track live operational goals using existing WMS data."
          actions={
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              New Goal
            </Button>
          }
        />

        <ListCard
          className="mt-5"
          header={
            <div>
              <h2 className="text-sm font-medium text-ink">Find goals</h2>
              <p className="mt-1 text-xs text-muted-foreground">Search, filter and sort the goals shown on this dashboard.</p>
            </div>
          }
        >
          <div className="p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_180px_180px] md:items-end">
              <div>
                <Label htmlFor="operational-goal-search">Search</Label>
                <Input
                  id="operational-goal-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search goals, metrics or descriptions"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="operational-goal-status">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="operational-goal-status" className="mt-2 w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="operational-goal-domain">Domain</Label>
                <Select value={domainFilter} onValueChange={setDomainFilter}>
                  <SelectTrigger id="operational-goal-domain" className="mt-2 w-full">
                    <SelectValue placeholder="Domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {domainOptions.map((domain) => (
                      <SelectItem key={domain} value={domain}>{domain === 'ALL' ? 'All domains' : domain}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="operational-goal-sort">Sort</Label>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger id="operational-goal-sort" className="mt-2 w-full">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </ListCard>

        <div className="mt-5">
          <OperationalGoalList
            goals={visibleGoals}
            isLoading={isLoading}
            error={error}
            onRetry={loadGoals}
            onEdit={openEditDialog}
            onViewProgress={openProgressDialog}
            onArchive={(goal) => {
              setArchiveGoal(goal);
              setArchiveError('');
            }}
            onRestore={(goal) => {
              setRestoreTarget(goal);
              setRestoreError('');
            }}
            metricsById={metricsById}
          />
        </div>
        </>
        ) : creationView === 'create' ? (
          <>
            <PageHeader
              title="Create Operational Goal"
              description="Describe what you'd like to achieve. We'll prepare a measurable operational goal for you to review before anything is saved."
            />
            <OperationalGoalAIAssistDialog
              onOpenChange={(next) => { if (!next) cancelCreateFlow(); }}
              onDraft={draftWithAI}
              onSubmitDraft={useAIDraft}
              busy={aiBusy}
              error={aiError}
            />
          </>
        ) : creationView === 'review' ? (
          <>
            <PageHeader
              title="Review Goal"
              description="We've prepared a draft based on your goal. Review it, make any changes you'd like, then create the goal."
            />
            <OperationalGoalDialog
              key="review-draft"
              variant="page"
              goal={null}
              initialDraft={draftGoal}
              onOpenChange={(next) => { if (!next) cancelCreateFlow(); }}
              onSubmit={saveGoal}
              busy={dialogBusy}
              submitError={dialogError}
            />
          </>
        ) : creationView === 'edit' ? (
          <>
            <PageHeader
              title="Edit Operational Goal"
              description="Update your operational goal at any time. Changes will be reflected the next time progress is calculated."
            />
            <OperationalGoalDialog
              key={editingGoal?.id ?? 'edit-goal'}
              variant="page"
              goal={editingGoal}
              initialDraft={null}
              onOpenChange={(next) => { if (!next) cancelCreateFlow(); }}
              onSubmit={saveGoal}
              busy={dialogBusy}
              submitError={dialogError}
            />
          </>
        ) : (
          <>
            <PageHeader
              title="Goal Progress"
              description={progressGoal?.title ? `Live progress for ${progressGoal.title}.` : 'Live progress from WMS data.'}
              actions={<Button type="button" variant="outline" onClick={returnToDashboard}>Back to dashboard</Button>}
            />
            <OperationalGoalProgressDialog
              variant="page"
              goal={progressGoal}
              metric={progressGoal ? metricsById.get(progressGoal.metricId) : null}
              progress={progressData}
              loading={progressLoading}
              error={progressError}
              aiInsight={aiProgressInsight}
              aiLoading={aiProgressLoading}
              aiError={aiProgressError}
              onRetry={() => loadProgress(progressGoal)}
              onRetryAI={() => loadAIProgressInsight(progressGoal)}
              askWhyOpen={askWhyOpen}
              askWhyData={askWhyData}
              askWhyLoading={askWhyLoading}
              askWhyError={askWhyError}
              onAskWhy={() => loadAskWhy(progressGoal)}
              onRetryAskWhy={() => loadAskWhy(progressGoal)}
              onAskWhyOpenChange={setAskWhyOpen}
            />
          </>
        )}
      </PageShell>

      <AlertDialog open={Boolean(restoreTarget)} onOpenChange={(open) => !restoreBusy && !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this goal?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget?.title ? restoreTarget.title + ' will return to the Active goals view.' : 'This goal will return to the Active goals view.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {restoreError && <div role="alert" className="rounded-[10px] border border-line bg-danger-soft p-3 text-sm text-ink">{restoreError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore} disabled={restoreBusy}>{restoreBusy ? 'Restoring...' : 'Restore goal'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(archiveGoal)} onOpenChange={(open) => !archiveBusy && !open && setArchiveGoal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this goal?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveGoal?.title ? `${archiveGoal.title} will be hidden from the default Active view. You can still find it with the Status filter.` : 'This goal will be hidden from the default Active view.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {archiveError && <div role="alert" className="rounded-[10px] border border-line bg-danger-soft p-3 text-sm text-ink">{archiveError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArchive} disabled={archiveBusy}>{archiveBusy ? 'Archiving...' : 'Archive goal'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
