// ─────────────────────────────────────────────────────────────
// client/src/pages/SettingsPage.jsx
//
// The admin's one place for how the system is set up, in sections:
//
//   Email                    the Gmail connection, test send, and the
//                            finance recipient (GmailSettingsPage)
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
import ImpactFactorsForm from '../features/reporting/components/ImpactFactorsForm';
import { listSettings } from '../services/settingsAPI';

const SECTIONS = [
  { id: 'email',         label: 'Email' },
  { id: 'notifications', label: 'Notifications & reminders' },
  { id: 'stock',         label: 'Stock rules' },
  { id: 'reporting',     label: 'Reporting' },
  { id: 'certificates',  label: 'Certificates' },
  { id: 'accounts',      label: 'Accounts' },
];

const VALUE_SECTIONS = {
  notifications: {
    title: 'Notifications & reminders',
    description: 'When the gate writes off an uncollected pallet, and when reminders go out. The finance email recipient is under Email.',
  },
  stock:    { title: 'Stock rules', description: 'When managers are warned about delivered stock nearing its expiry date.' },
  accounts: { title: 'Accounts', description: 'Invites for new staff accounts.' },
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
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-medium">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        How the warehouse system is set up. Changes apply to everyone.
      </p>

      <ViewTabs className="mt-5" label="Settings sections" value={section} onChange={changeSection} tabs={SECTIONS} />

      <div className="mt-6">
        {section === 'email' ? <GmailSettingsPage embedded /> : null}

        {valueSection ? (
          error ? (
            <p className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
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
              <CardTitle>How kilograms become people fed</CardTitle>
              <CardDescription>
                The impact factors behind every meals and people-served figure. Targets are set by each manager on Operations Reports.
              </CardDescription>
            </CardHeader>
            <CardContent><ImpactFactorsForm /></CardContent>
          </Card>
        ) : null}

        {section === 'certificates' ? <CertificateSettingsForm /> : null}
      </div>
    </main>
  );
}
