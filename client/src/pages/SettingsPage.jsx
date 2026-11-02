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
//   Stock rules              the two expiry-warning windows, and what a
//                            crate, bag, box and punnet weigh
//   Recipes                  what picking slips are made from: the
//                            summer and winter recipes, when each season
//                            starts, dated overrides, and the centres
//                            that keep their own order (RecipesSection)
//   Reporting                how kilograms become people fed (the
//                            impact factors). Targets are each
//                            manager's own, on Operations Reports.
//   Documents                the letterhead on printed notes, and the
//                            Section 18A certificate threshold
//   Accounts                 how long a sign-in and an invite link last
//   Translations             the floor's Afrikaans and isiXhosa wording,
//                            changed by the admin (TranslationsSection)
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
import AppSettingsSection from '../features/settings/AppSettingsSection';
import ConnectionsSection from '../features/settings/ConnectionsSection';
import RecipesSection from '../features/settings/RecipesSection';
import TranslationsSection from '../features/settings/TranslationsSection';
import ImpactFactorsForm from '../features/reporting/ImpactFactorsForm';
import { listSettings } from '../services/settingsAPI';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ErrorBanner from '@/components/ui/error-banner';

const SECTIONS = [
  { id: 'email',         label: 'Email' },
  { id: 'connections',   label: 'Connections' },
  { id: 'notifications', label: 'Reminders' },
  { id: 'stock',         label: 'Stock' },
  { id: 'recipes',       label: 'Recipes' },
  { id: 'reporting',     label: 'Impact' },
  { id: 'organisation',  label: 'Documents' },
  { id: 'accounts',      label: 'Access' },
  { id: 'translations',  label: 'Wording' },
];

const VALUE_SECTIONS = {
  notifications: {
    title: 'Notifications & reminders',
    description: 'Set when uncollected pallets are written off, when reminders go out, and when a compost kit counts as idle.',
  },
  stock:    { title: 'Stock rules', description: 'Set when managers are warned about expiring stock, and what a crate, bag, box and punnet weigh.' },
  organisation: {
    title: 'Documents',
    description: 'Set the letterhead on printed notes and the value from which a donation gets a Section 18A certificate.',
  },
  accounts: { title: 'Access', description: 'Set how long sign-ins and links last, and when an idle volunteer is signed out.' },
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
      <PageHeader title="Settings" description="Set up email, reminders, stock rules, recipes, accounts and the floor's wording." />

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

        {section === 'recipes' ? <RecipesSection settings={settings} onSettingsSaved={setSettings} /> : null}

        {section === 'translations' ? <TranslationsSection /> : null}

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

      </div>
    </PageShell>
  );
}
