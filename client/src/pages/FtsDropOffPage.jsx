// ─────────────────────────────────────────────────────────────
// client/src/pages/FtsDropOffPage.jsx
// Route: /fts/:token (public, no sign-in)
//
// What the QR code on a Feed the Soil drop-off poster opens. Someone
// returning compost at a pop-up stand or another site enters its
// weight, and if they like their name and an email for a thank-you,
// and is thanked on screen straight away. The token names the site.
// Phone first: it is read standing at a stand, one-handed.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Loader2, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { getPublicDropSite, submitPublicDropoff } from '@/services/ftsDropPointAPI';

export default function FtsDropOffPage() {
  const { token } = useParams();
  const [site, setSite] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ kg: '', name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPublicDropSite(token)
      .then((s) => { if (!cancelled) setSite(s); })
      .catch((err) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [token]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDone(await submitPublicDropoff(token, { kg: Number(form.kg), name: form.name, email: form.email }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-svh bg-background px-4 py-8">
      <Card className="mx-auto max-w-md border border-line">
        <CardContent className="py-8">
          {loadError ? (
            <div className="text-center">
              <Sprout className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
              <h1 className="mt-3 text-lg font-semibold">This code is not working</h1>
              <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
            </div>
          ) : !site ? (
            <div className="flex justify-center py-6" aria-busy="true"><Loader2 className="animate-spin" aria-label="Loading" /></div>
          ) : done ? (
            <div className="text-center" role="status">
              <CheckCircle className="mx-auto size-12 text-good" aria-hidden="true" />
              <h1 className="mt-3 text-xl font-semibold">Thank you!</h1>
              <p className="mt-2 text-sm">
                Your {done.kg} kg of compost at {done.site} is logged. It goes back into the soil that grows food for children.
              </p>
              {done.thanksEmailed ? <p className="mt-2 text-sm text-muted-foreground">A thank-you is on its way to your email.</p> : null}
              <Button type="button" variant="outline" className="mt-5" onClick={() => { setDone(null); setForm({ kg: '', name: '', email: '' }); }}>
                Log another drop-off
              </Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="mb-5 text-center">
                <Sprout className="mx-auto size-10 text-good" aria-hidden="true" />
                <h1 className="mt-2 text-xl font-semibold">Feed the Soil</h1>
                <p className="text-sm text-muted-foreground">Drop-off at {site.name}</p>
              </div>
              <FieldGroup>
                {error ? <FieldError role="alert">{error}</FieldError> : null}
                <Field>
                  <FieldLabel htmlFor="fts-kg">Weight of your compost (kg)</FieldLabel>
                  <Input id="fts-kg" type="number" min="0.01" max="200" step="0.01" inputMode="decimal" required value={form.kg} onChange={set('kg')} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fts-name">Your name (optional)</FieldLabel>
                  <Input id="fts-name" maxLength={120} autoComplete="name" value={form.name} onChange={set('name')} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fts-email">Email (optional)</FieldLabel>
                  <Input id="fts-email" type="email" maxLength={254} autoComplete="email" value={form.email} onChange={set('email')} />
                  <FieldDescription>Only to send you a thank-you. We do not use it for anything else.</FieldDescription>
                </Field>
                <Button type="submit" disabled={busy || !form.kg}>
                  {busy ? <Loader2 className="animate-spin" /> : null} Log my drop-off
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
