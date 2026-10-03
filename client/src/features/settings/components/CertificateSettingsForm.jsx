// ─────────────────────────────────────────────────────────────
// client/src/features/settings/components/CertificateSettingsForm.jsx
//
// The organisation details printed on Section 18A certificates and the
// email that carries them (/api/certificate-settings). The API existed
// with no screen; this is it.
//
// The organisation name is the one field the server requires.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toastContext';
import { getCertificateSettings, saveCertificateSettings } from '../../../services/settingsAPI';

const GROUPS = [
  { title: 'Organisation', fields: [
    { key: 'organisationName', label: 'Organisation name' },
    { key: 'pboNumber', label: 'PBO number' },
    { key: 'npoNumber', label: 'NPO number' },
    { key: 'physicalAddress', label: 'Physical address', long: true },
    { key: 'postalAddress', label: 'Postal address', long: true },
    { key: 'contactEmail', label: 'Contact email', type: 'email' },
    { key: 'contactPhone', label: 'Contact phone' },
    { key: 'website', label: 'Website' },
  ] },
  { title: 'Certificate email', fields: [
    { key: 'senderDisplayName', label: 'Sender name' },
    { key: 'replyToEmail', label: 'Reply-to address', type: 'email' },
    { key: 'subjectTemplate', label: 'Subject' },
    { key: 'footerText', label: 'Footer', long: true },
  ] },
  { title: 'On the certificate', fields: [
    { key: 'certificatePrefix', label: 'Certificate number prefix' },
    { key: 'signatureName', label: 'Signed by' },
    { key: 'signatureTitle', label: 'Signatory title' },
    { key: 'defaultAcknowledgementMessage', label: 'Acknowledgement message', long: true },
  ] },
];
const KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));

export default function CertificateSettingsForm() {
  const toast = useToast();
  const [saved, setSaved] = useState(null);       // what the server has, or null
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getCertificateSettings()
      .then((data) => {
        if (cancelled) return;
        setSaved(data);
        setDraft(Object.fromEntries(KEYS.map((k) => [k, data?.[k] ?? ''])));
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load the certificate details.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const changed = KEYS.some((k) => (draft[k] ?? '') !== (saved?.[k] ?? ''));

  const save = async () => {
    if (!String(draft.organisationName ?? '').trim()) {
      setError('The organisation name is required.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const data = await saveCertificateSettings(draft, { exists: Boolean(saved) });
      setSaved(data ?? draft);
      toast({ variant: 'success', title: 'Certificate details saved' });
    } catch (err) {
      setError(err.message || 'Could not save the certificate details.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      {!saved ? (
        <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
          Enter at least the organisation name before issuing Section 18A certificates.
        </p>
      ) : null}
      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardHeader><CardTitle>{g.title}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {g.fields.map((f) => {
              const id = `cert-${f.key}`;
              const Control = f.long ? Textarea : Input;
              return (
                <Field key={f.key} className={f.long ? 'sm:col-span-2' : ''}>
                  <FieldLabel htmlFor={id}>{f.label}</FieldLabel>
                  <Control
                    id={id} type={f.long ? undefined : (f.type ?? 'text')}
                    value={draft[f.key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                </Field>
              );
            })}
          </CardContent>
        </Card>
      ))}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <Button type="button" onClick={save} disabled={busy || !changed}>
        {busy ? 'Saving…' : 'Save certificate details'}
      </Button>
    </div>
  );
}
