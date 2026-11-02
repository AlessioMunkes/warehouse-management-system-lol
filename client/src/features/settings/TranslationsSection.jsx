// ─────────────────────────────────────────────────────────────
// client/src/features/settings/TranslationsSection.jsx
//
// Settings → Wording: change the Afrikaans or isiXhosa wording of
// the floor and volunteer screens, without a developer.
//
// Lists every piece of translated text the app has: the keyed messages
// (translations/messages.js) and the on-page phrases (phrases.js), each
// with its English, the built-in translation and the admin's own
// wording if there is one. Saving one stores it for this warehouse
// (PUT /api/translations); Reset goes back to the built-in wording.
//
// Values filled in on screen ({name}, or {} in a phrase) must stay in
// the wording; the server refuses one that drops or invents them.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import NativeSelect from '@/components/ui/native-select';
import ErrorBanner from '@/components/ui/error-banner';
import { useToast } from '@/components/ui/toastContext';
import { setTranslationOverrides } from '../../translations';
import translationAPI from '../../services/translationAPI';
import { buildEntries } from './translationEntries';

const LANGUAGES = [
  { code: 'af', name: 'Afrikaans', column: 1 },
  { code: 'xh', name: 'isiXhosa', column: 2 },
];
const PAGE = 25;
const EMPTY = { key: { af: {}, xh: {} }, phrase: { af: {}, xh: {} } };

const ownOf = (overrides, row, language) => overrides[row.kind]?.[language]?.[row.source];

function Row({ row, language, own, onSaved }) {
  const toast = useToast();
  const builtIn = row.builtIn[language];
  const current = own ?? builtIn ?? '';
  const [draft, setDraft] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = draft.trim() !== current.trim();

  const save = async () => {
    setBusy(true); setError('');
    try {
      await translationAPI.saveOverride({ language, kind: row.kind, source: row.source, text: draft, placeholders: row.placeholders });
      onSaved(row, draft.trim());
      toast({ variant: 'success', title: 'Wording saved' });
    } catch (err) {
      setError(err.message || 'Could not save the wording.');
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true); setError('');
    try {
      await translationAPI.resetOverride({ language, kind: row.kind, source: row.source });
      onSaved(row, null);
      setDraft(builtIn ?? '');
      toast({ variant: 'success', title: 'Back to the built-in wording' });
    } catch (err) {
      setError(err.message || 'Could not reset the wording.');
    } finally {
      setBusy(false);
    }
  };

  const label = `${LANGUAGES.find((l) => l.code === language)?.name} for “${row.english}”`;
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-medium">{row.english}</p>
        {own !== undefined ? <Badge variant="secondary">Changed</Badge> : null}
        {own === undefined && !builtIn ? <Badge variant="outline">Not translated</Badge> : null}
      </div>
      {row.kind === 'key' ? <p className="font-mono text-xs text-muted-foreground">{row.source}</p> : null}
      {own !== undefined && builtIn ? (
        <p className="text-xs text-muted-foreground">Built in: {builtIn}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-64 flex-1" aria-label={label} value={draft} maxLength={1000}
          placeholder={builtIn ? undefined : 'Shows in English until translated'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && changed && draft.trim()) save(); }}
        />
        <Button type="button" size="sm" disabled={busy || !changed || !draft.trim()} onClick={save}>Save</Button>
        {own !== undefined ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={reset}>Reset</Button>
        ) : null}
      </div>
      {row.placeholders.length ? (
        <p className="text-xs text-muted-foreground">
          Keep {row.kind === 'key' ? row.placeholders.map((p) => `{${p}}`).join(' ') : row.placeholders.join(' ')}: the app fills {row.placeholders.length === 1 ? 'it' : 'them'} in.
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </li>
  );
}

export default function TranslationsSection() {
  const [phrases, setPhrases] = useState(null);
  const [overrides, setOverrides] = useState(null);
  const [error, setError] = useState('');
  const [language, setLanguageShown] = useState('af');
  const [query, setQuery] = useState('');
  const [show, setShow] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    Promise.all([import('../../translations/phrases'), translationAPI.getOverrides()])
      .then(([mod, data]) => {
        if (cancelled) return;
        setPhrases(mod.PHRASES);
        setOverrides({ key: { ...EMPTY.key, ...data?.key }, phrase: { ...EMPTY.phrase, ...data?.phrase } });
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load the wording.'); });
    return () => { cancelled = true; };
  }, []);

  const entries = useMemo(() => (phrases ? buildEntries(phrases) : []), [phrases]);
  const matching = useMemo(() => {
    if (!overrides) return [];
    const q = query.trim().toLowerCase();
    return entries.filter((row) => {
      const own = ownOf(overrides, row, language);
      if (show === 'changed' && own === undefined) return false;
      if (show === 'missing' && (own !== undefined || row.builtIn[language])) return false;
      if (!q) return true;
      return [row.english, row.builtIn[language], own, row.kind === 'key' ? row.source : null]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [entries, overrides, language, query, show]);

  if (error) return <ErrorBanner message={error} />;
  if (!overrides || !phrases) return <Skeleton className="h-64 w-full" />;

  const changedCount = entries.filter((row) => ownOf(overrides, row, language) !== undefined).length;

  const saved = (row, text) => {
    setOverrides((prev) => {
      const next = { key: { ...prev.key }, phrase: { ...prev.phrase } };
      const forLanguage = { ...(next[row.kind][language] ?? {}) };
      if (text === null) delete forLanguage[row.source]; else forLanguage[row.source] = text;
      next[row.kind] = { ...next[row.kind], [language]: forLanguage };
      // Screens open in this browser pick the new wording up at once.
      setTranslationOverrides(next);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Translations</CardTitle>
        <CardDescription>
          Change the Afrikaans and isiXhosa wording on the warehouse floor and volunteer screens.
          Your wording replaces the built-in translation for everyone at this warehouse. Manager
          and admin screens stay in English.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Language" value={language} onChange={(e) => { setLanguageShown(e.target.value); setLimit(PAGE); }}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Show" value={show} onChange={(e) => { setShow(e.target.value); setLimit(PAGE); }}>
            <option value="all">All wording</option>
            <option value="changed">Changed by you ({changedCount})</option>
            <option value="missing">Not translated yet</option>
          </NativeSelect>
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="pl-8" type="search" aria-label="Search the wording" placeholder="Search English or translation"
              value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {matching.length === 1 ? '1 piece of wording' : `${matching.length.toLocaleString('en-ZA')} pieces of wording`}
        </p>
        {matching.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">Nothing matches.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {matching.slice(0, limit).map((row) => (
              <Row
                key={`${language}|${row.kind}|${row.source}|${ownOf(overrides, row, language) ?? ''}`}
                row={row} language={language} own={ownOf(overrides, row, language)} onSaved={saved}
              />
            ))}
          </ul>
        )}
        {matching.length > limit ? (
          <Button type="button" variant="outline" onClick={() => setLimit((n) => n + PAGE * 2)}>
            Show more ({(matching.length - limit).toLocaleString('en-ZA')} left)
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
