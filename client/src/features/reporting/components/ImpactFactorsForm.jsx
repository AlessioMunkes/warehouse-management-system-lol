// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ImpactFactorsForm.jsx
//
// How kilograms become people fed: the reporting factors every "meals"
// or "people served" figure multiplies by. Used in the Impact Reports
// screen's "Adjust estimates" dialog and in admin Settings → Reporting,
// so the questions are asked once.
//
// Phrased as direct questions rather than "X per kg dispatched" — the
// number is identical, but "how many meals does 1 kg feed" is what a
// manager who has never heard the word "factor" can answer.
//
// Each save inserts a new effective-dated value (reportingFactor
// .repository.js); nothing already reported changes.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import reportingAPI from '../../../services/reportingAPI';

const FACTOR_DEFS = [
  { key: 'kg_to_meals',                  label: 'How many meals does 1 kg feed?' },
  { key: 'kg_to_adults_served',          label: 'How many soup kitchen adults does 1 kg feed?' },
  { key: 'kg_to_dignity_kitchen_served', label: 'How many dignity kitchen guests does 1 kg feed?' },
  { key: 'kg_to_community_served',       label: 'How many people via community requests does 1 kg feed?' },
];

export default function ImpactFactorsForm() {
  const [values, setValues] = useState({});
  const [current, setCurrent] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [savedKey, setSavedKey] = useState(null);

  // The value in force now, shown beside each question. A factor that
  // has never been set just shows nothing.
  useEffect(() => {
    let cancelled = false;
    Promise.all(FACTOR_DEFS.map((f) => reportingAPI.getFactorHistory(f.key)
      .then((res) => [f.key, (res?.data ?? res)?.[0]?.value ?? null])
      .catch(() => [f.key, null])))
      .then((pairs) => { if (!cancelled) setCurrent(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, []);

  const submit = async (key) => {
    const value = values[key];
    if (!value) return;
    setBusy(key); setError(null); setSavedKey(null);
    try {
      await reportingAPI.setFactor(key, { value: Number(value) });
      setCurrent((c) => ({ ...c, [key]: Number(value) }));
      setSavedKey(key);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The warehouse only ever weighs what left in kilograms — it never counts plates or
        people directly. Every "meals," "adults" or "people served" number is that weight
        multiplied by the answer below. Change an answer and every report from today onward
        uses it; nothing already reported changes.
      </p>
      {FACTOR_DEFS.map((f) => (
        <div key={f.key} className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor={`factor-${f.key}`}>{f.label}</Label>
            <Input
              id={`factor-${f.key}`} type="number" min="0" step="0.01"
              placeholder={current[f.key] !== null && current[f.key] !== undefined ? `Now ${current[f.key]}` : ''}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
          <Button type="button" size="sm" disabled={busy === f.key || !values[f.key]} onClick={() => submit(f.key)} loading={busy === f.key}>
            {busy === f.key ? 'Saving…' : savedKey === f.key ? 'Saved' : 'Save'}
          </Button>
        </div>
      ))}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
