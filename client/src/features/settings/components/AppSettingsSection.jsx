// ─────────────────────────────────────────────────────────────
// client/src/features/settings/components/AppSettingsSection.jsx
//
// One Settings section's values from /api/settings: a number each,
// with what it does, its unit and its default. Saved together with one
// button, so two values that depend on each other (the two expiry
// warnings) are checked as a pair.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { useToast } from '@/components/ui/toastContext';
import { updateSettings } from '../../../services/settingsAPI';

export default function AppSettingsSection({ title, description, settings, onSaved, children }) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => Object.fromEntries(settings.map((s) => [s.key, String(s.value)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const changed = settings.filter((s) => draft[s.key] !== String(s.value));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const updated = await updateSettings(Object.fromEntries(changed.map((s) => [s.key, Number(draft[s.key])])));
      onSaved(updated);
      toast({ variant: 'success', title: `${title} saved` });
    } catch (err) {
      setError(err.message || 'Could not save these settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-5">
        {settings.map((s) => {
          const id = `setting-${s.key}`;
          return (
            <Field key={s.key}>
              <FieldLabel htmlFor={id}>{s.label}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={id} type="number" inputMode="numeric" className="w-28 tabular-nums"
                  min={s.min} max={s.max} step="1"
                  value={draft[s.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                />
                <span className="text-sm text-muted-foreground">{s.unit}</span>
              </div>
              <FieldDescription>
                {s.help} Default {s.default}{s.unit === ':00' ? ':00' : ` ${s.unit}`}.
              </FieldDescription>
            </Field>
          );
        })}

        {children}

        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" onClick={save} disabled={busy || changed.length === 0} loading={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button
            type="button" variant="ghost" disabled={busy || changed.length === 0}
            onClick={() => { setDraft(Object.fromEntries(settings.map((s) => [s.key, String(s.value)]))); setError(null); }}
          >
            Undo changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
