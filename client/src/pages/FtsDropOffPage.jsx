// ─────────────────────────────────────────────────────────────
// client/src/pages/FtsDropOffPage.jsx
// Routes: /fts/:token and /fts (public, no sign-in)
//
// What the QR code on a Feed the Soil drop-off poster opens. Someone
// returning compost at a pop-up stand or another site enters its
// weight, and if they like their name and an email for a thank-you,
// and is thanked on screen straight away.
//
// A site's own poster carries a token that names the site. The general
// poster (/fts, migration 070) has none: the form asks where they are,
// from the open sites or "Somewhere else" with the place typed, for a
// stall that has no site set up.
// Phone first: it is read standing at a stand, one-handed.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Loader2, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import NativeSelect from '@/components/ui/native-select';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { getPublicDropSite, submitPublicDropoff, getPublicDropSites, submitAnyDropoff } from '@/services/ftsDropPointAPI';

// The dropdown's value for "Somewhere else"; a site's is its id.
const ELSEWHERE = 'elsewhere';
const BLANK = { kg: '', name: '', email: '', where: '', place: '' };

export default function FtsDropOffPage() {
  const { token } = useParams();
  // A site's poster: the site. The general poster: the open sites.
  const [site, setSite] = useState(null);
  const [sites, setSites] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (token ? getPublicDropSite(token) : getPublicDropSites())
      .then((data) => {
        if (cancelled) return;
        if (token) setSite(data);
        else setSites(data ?? []);
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [token]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  // With no sites set up, "Somewhere else" is the only choice.
  const where = sites && sites.length === 0 ? ELSEWHERE : form.where;
  const placeMissing = !token && (!where || (where === ELSEWHERE && !form.place.trim()));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const values = { kg: Number(form.kg), name: form.name, email: form.email };
    try {
      setDone(token
        ? await submitPublicDropoff(token, values)
        : await submitAnyDropoff(where === ELSEWHERE
          ? { ...values, place: form.place }
          : { ...values, dropPointId: Number(where) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = token ? site : sites;

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
          ) : !ready ? (
            <div className="flex justify-center py-6" aria-busy="true"><Loader2 className="animate-spin" aria-label="Loading" /></div>
          ) : done ? (
            <div className="text-center" role="status">
              <CheckCircle className="mx-auto size-12 text-good" aria-hidden="true" />
              <h1 className="mt-3 text-xl font-semibold">Thank you!</h1>
              <p className="mt-2 text-sm">
                Your {done.kg} kg of compost at {done.site} is logged. It goes back into the soil that grows food for children.
              </p>
              {done.thanksEmailed ? <p className="mt-2 text-sm text-muted-foreground">A thank-you is on its way to your email.</p> : null}
              <Button type="button" variant="outline" className="mt-5" onClick={() => { setDone(null); setForm({ ...BLANK, where: form.where, place: form.place }); }}>
                Log another drop-off
              </Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="mb-5 text-center">
                <Sprout className="mx-auto size-10 text-good" aria-hidden="true" />
                <h1 className="mt-2 text-xl font-semibold">Feed the Soil</h1>
                <p className="text-sm text-muted-foreground">{token ? `Drop-off at ${site.name}` : 'Compost drop-off'}</p>
              </div>
              <FieldGroup>
                {error ? <FieldError role="alert">{error}</FieldError> : null}
                {!token && sites.length > 0 ? (
                  <Field>
                    <FieldLabel htmlFor="fts-where">Where are you dropping off?</FieldLabel>
                    <NativeSelect id="fts-where" className="w-full" required value={form.where} onChange={set('where')}>
                      <option value="" disabled>Choose a site</option>
                      {sites.map((s) => (
                        <option key={s.id} value={String(s.id)}>{s.suburb ? `${s.name} (${s.suburb})` : s.name}</option>
                      ))}
                      <option value={ELSEWHERE}>Somewhere else</option>
                    </NativeSelect>
                  </Field>
                ) : null}
                {!token && where === ELSEWHERE ? (
                  <Field>
                    <FieldLabel htmlFor="fts-place">{sites.length ? 'Where are you?' : 'Where are you dropping off?'}</FieldLabel>
                    <Input id="fts-place" maxLength={120} required placeholder="The stall, market or school" value={form.place} onChange={set('place')} />
                  </Field>
                ) : null}
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
                <Button type="submit" disabled={busy || !form.kg || placeMissing}>
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
