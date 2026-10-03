// ─────────────────────────────────────────────────────────────
// client/src/pages/SettingsPage.jsx
//
// The admin's one place for how the system is set up, in sections:
//
//   Email                    the Gmail connection, test send, and the
//                            finance recipient (GmailSettingsPage)
//   Connections              whether each outside service — database,
//                            Gmail, email links, scheduled jobs, AI,
//                            phone notifications, volunteer system —
//                            is working (ConnectionsSection)
//   Notifications & reminders the not-collected cut-off and the
//                            collection reminder send time
//   Stock rules              the two expiry-warning windows
//   Reporting                how kilograms become people fed (the
//                            impact factors). Targets are each
//                            manager's own, on Operations Reports.
//   Certificates             what Section 18A certificates say
//   Accounts                 how long an invite link lasts
//
// The section is in ?section=. /admin/email-integration opens this
// page on Email — it is where Google's sign-in sends the admin back to.
//
// Per-person preferences (theme, reduced motion, sidebar, dashboard
// layout, table columns) are not here: they stay with each person, on
// their device.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ViewTabs from '@/components/ui/view-tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import GmailSettingsPage from './GmailSettingsPage';
import AppSettingsSection from '../features/settings/components/AppSettingsSection';
import CertificateSettingsForm from '../features/settings/components/CertificateSettingsForm';
import ConnectionsSection from '../features/settings/components/ConnectionsSection';
import ImpactFactorsForm from '../features/reporting/components/ImpactFactorsForm';
import { listSettings } from '../services/settingsAPI';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ErrorBanner from '@/components/ui/error-banner';

const SECTIONS = [
  { id: 'email',         label: 'Email' },
  { id: 'connections',   label: 'Connections' },
  { id: 'notifications', label: 'Notifications & reminders' },
  { id: 'stock',         label: 'Stock rules' },
  { id: 'reporting',     label: 'Reporting' },
  { id: 'certificates',  label: 'Certificates' },
  { id: 'accounts',      label: 'Accounts' },
];

const VALUE_SECTIONS = {
  notifications: {
    title: 'Notifications & reminders',
    description: 'Set when uncollected pallets are written off and when reminders go out.',
  },
  stock:    { title: 'Stock rules', description: 'Set when managers are warned about stock nearing its expiry date.' },
  accounts: { title: 'Accounts', description: 'Set how long invite links stay valid.' },
};

export default function SettingsPage({ defaultSection = 'email' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const asked = searchParams.get('section');
  const section = SECTIONS.some((s) => s.id === asked) ? asked : defaultSection;

  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listSettings()
      .then((rows) => { if (!cancelled) setSettings(rows); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load settings.'); });
    return () => { cancelled = true; };
  }, []);

  const changeSection = (id) => {
    // Keep anything else in the URL (Google's ?gmail= result) intact.
    const next = new URLSearchParams(searchParams);
    next.set('section', id);
    setSearchParams(next, { replace: true });
  };

  const valueSection = VALUE_SECTIONS[section];

  return (
    // Narrower than the list screens: this page is forms, and a form
    // line stretched across 6xl is hard to read.
    <PageShell width="max-w-4xl">
      <PageHeader title="Settings" description="Set up email, reminders, stock rules, reporting and accounts. Changes apply to everyone." />

      <ViewTabs className="mt-5" label="Settings sections" value={section} onChange={changeSection} tabs={SECTIONS} />

      <div className="mt-6">
        {section === 'email' ? <GmailSettingsPage embedded /> : null}
        {section === 'connections' ? <ConnectionsSection onSection={changeSection} /> : null}

        {valueSection ? (
          error ? (
            <ErrorBanner message={error} />
          ) : !settings ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <AppSettingsSection
              key={section}
              title={valueSection.title}
              description={valueSection.description}
              settings={settings.filter((s) => s.section === section)}
              onSaved={setSettings}
            />
          )
        ) : null}

        {section === 'reporting' ? (
          <Card>
            <CardHeader>
              <CardTitle>Impact estimates</CardTitle>
              <CardDescription>
                Set the rates that turn kilograms dispatched into meals and people served.
              </CardDescription>
            </CardHeader>
            <CardContent><ImpactFactorsForm /></CardContent>
          </Card>
        ) : null}

        {section === 'certificates' ? <CertificateSettingsForm /> : null}
      </div>
    </PageShell>
  );
}
