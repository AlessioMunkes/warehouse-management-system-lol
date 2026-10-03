// ─────────────────────────────────────────────────────────────
// client/src/pages/AdminActivityLogPage.jsx
//
// Activity log (admin): what staff did, and who signed in at the door,
// on one page with a Staff / Volunteers toggle.
//
// The view lives in the URL (?view=staff or ?view=volunteers) so each
// one can be linked, and the browser's back button steps between them.
// Anything else (missing, misspelt) is the Staff view. Each view keeps
// its own filters, columns and detail panel; switching unmounts the
// other one, so its filters start fresh when you come back.
// ─────────────────────────────────────────────────────────────
import { useSearchParams } from 'react-router-dom';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import StaffActivityView from '../features/admin/activityLog/StaffActivityView';
import VolunteerLogView  from '../features/admin/activityLog/VolunteerLogView';

const VIEWS = [
  { id: 'staff',      label: 'Staff' },
  { id: 'volunteers', label: 'Volunteers' },
];

export default function AdminActivityLogPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'volunteers' ? 'volunteers' : 'staff';

  return (
    <PageShell>
      <PageHeader
        title="Activity log"
        description="See what staff did, or who signed in at the door."
      />

      <ViewTabs
        className="mt-5"
        label="Activity log views"
        value={view}
        onChange={(id) => setParams({ view: id })}
        tabs={VIEWS}
      />

      {view === 'volunteers' ? <VolunteerLogView key="volunteers" /> : <StaffActivityView key="staff" />}
    </PageShell>
  );
}
