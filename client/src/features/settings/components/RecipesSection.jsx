// ─────────────────────────────────────────────────────────────
// client/src/features/settings/components/RecipesSection.jsx
//
// Settings → Recipes: what picking slips are made from.
//
//   Seasons     the day summer starts and the day winter starts. A date
//               belongs to whichever started most recently.
//   Bands       the band a centre's child count is rounded up to (5 by
//               default: 21 to 25 children all get the slip for 25).
//               One of the /api/settings values, passed in by the page.
//   Recipes     the summer recipe, the winter recipe, and any overrides
//               — each a list of products with an amount PER CHILD. A
//               centre's slip is that amount times its banded count. An
//               override has dates, and replaces the season's recipe
//               inside them.
//   Own orders  the centres that keep their standing order and ignore
//               the recipe.
//
// A recipe with no lines is not used: slips for its dates come from each
// centre's standing order, as they did before recipes existed.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import ViewTabs from '@/components/ui/view-tabs';
import ErrorBanner from '@/components/ui/error-banner';
import { useToast } from '@/components/ui/toastContext';
import { DEFAULT_CHILD_BAND, exampleCentre, exampleQuantity } from '../recipeMath';
import AppSettingsSection from './AppSettingsSection';
import productAPI from '../../../services/productAPI';
import beneficiaryAPI from '../../../services/beneficiaryAPI';
import {
  getRecipes, createOverrideRecipe, saveRecipe, deleteOverrideRecipe,
  saveSeasonStarts, saveOwnOrderCentres,
} from '../../../services/recipeAPI';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
// 2001 is not a leap year: a season cannot start on 29 February.
const daysIn = (month) => new Date(Date.UTC(2001, month, 0)).getUTCDate();
const NEW = 'new';

const dateLabel = (iso) => (iso
  ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  : '');

// ── Seasons ───────────────────────────────────────────────────
function DayOfYear({ id, label, value, onChange }) {
  const days = Array.from({ length: daysIn(value.month) }, (_, i) => i + 1);
  return (
    <Field>
      <FieldLabel htmlFor={`${id}-day`}>{label}</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(value.day)}
          onValueChange={(day) => onChange({ ...value, day: Number(day) })}
        >
          <SelectTrigger id={`${id}-day`} className="w-20" aria-label={`${label}, day`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {days.map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={String(value.month)}
          onValueChange={(month) => onChange({ month: Number(month), day: Math.min(value.day, daysIn(Number(month))) })}
        >
          <SelectTrigger className="w-40" aria-label={`${label}, month`}>
            <SelectValue>{MONTHS[value.month - 1]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((name, i) => <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
}

function SeasonsCard({ recipes, currentRecipe, onSaved }) {
  const toast = useToast();
  const saved = useMemo(() => ({
    summer: recipes.find((r) => r.kind === 'summer')?.seasonStart ?? { month: 9, day: 1 },
    winter: recipes.find((r) => r.kind === 'winter')?.seasonStart ?? { month: 5, day: 1 },
  }), [recipes]);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      onSaved(await saveSeasonStarts(draft));
      toast({ variant: 'success', title: 'Seasons saved' });
    } catch (err) {
      setError(err.message || 'Could not save the seasons.');
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seasons</CardTitle>
        <CardDescription>
          Set the day each season starts. Slips use the summer recipe from the summer date and the winter recipe from the winter date.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <DayOfYear id="season-summer" label="Summer starts" value={draft.summer} onChange={(summer) => setDraft((d) => ({ ...d, summer }))} />
          <DayOfYear id="season-winter" label="Winter starts" value={draft.winter} onChange={(winter) => setDraft((d) => ({ ...d, winter }))} />
        </div>
        {currentRecipe ? (
          <p className="text-sm text-muted-foreground">Slips dated today use the {currentRecipe.name} recipe.</p>
        ) : null}
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" onClick={save} disabled={busy || !changed} loading={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          <Button type="button" variant="ghost" disabled={busy || !changed} onClick={() => { setDraft(saved); setError(null); }}>
            Undo changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── One recipe ────────────────────────────────────────────────
const toDraftLines = (recipe) => (recipe?.lines ?? []).map((line) => ({
  productId: String(line.productId), quantityPerChild: String(line.quantityPerChild), unit: line.unit,
}));

function RecipeEditor({ recipe, products, band, onSaved, onCreated, onDeleted }) {
  const toast = useToast();
  const isNew = !recipe;
  const isOverride = isNew || recipe.kind === 'override';

  const initial = useMemo(() => ({
    name: recipe?.name ?? '', startsOn: recipe?.startsOn ?? '', endsOn: recipe?.endsOn ?? '',
    lines: toDraftLines(recipe),
  }), [recipe]);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  const productById = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);
  const used = new Set(draft.lines.map((l) => l.productId).filter(Boolean));

  const setLine = (index, patch) => setDraft((d) => ({
    ...d, lines: d.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
  }));
  const addLine = () => setDraft((d) => ({ ...d, lines: [...d.lines, { productId: '', quantityPerChild: '', unit: '' }] }));
  const removeLine = (index) => setDraft((d) => ({ ...d, lines: d.lines.filter((_, i) => i !== index) }));

  const save = async () => {
    setBusy(true); setError(null);
    const body = {
      lines: draft.lines.map((l) => ({ productId: Number(l.productId) || null, quantityPerChild: l.quantityPerChild, unit: l.unit })),
      ...(isOverride ? { name: draft.name, startsOn: draft.startsOn, endsOn: draft.endsOn } : {}),
    };
    try {
      if (isNew) {
        onCreated(await createOverrideRecipe(body));
        toast({ variant: 'success', title: 'Recipe created' });
      } else {
        onSaved(await saveRecipe(recipe.id, body));
        toast({ variant: 'success', title: `${recipe.name} recipe saved` });
      }
    } catch (err) {
      setError(err.message || 'Could not save the recipe.');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setError(null);
    try {
      onDeleted(await deleteOverrideRecipe(recipe.id));
      toast({ variant: 'success', title: 'Recipe deleted' });
    } catch (err) {
      setError(err.message || 'Could not delete the recipe.');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {isOverride ? (
        <div className="grid gap-5 sm:grid-cols-3">
          <Field className="sm:col-span-3">
            <FieldLabel htmlFor="recipe-name">Name</FieldLabel>
            <Input
              id="recipe-name" maxLength={80} placeholder="e.g. December holiday" value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="recipe-from">From</FieldLabel>
            <Input id="recipe-from" type="date" value={draft.startsOn} onChange={(e) => setDraft((d) => ({ ...d, startsOn: e.target.value }))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="recipe-to">To</FieldLabel>
            <Input id="recipe-to" type="date" value={draft.endsOn} min={draft.startsOn || undefined} onChange={(e) => setDraft((d) => ({ ...d, endsOn: e.target.value }))} />
            <FieldDescription>Slips dated from the first day to the last use this recipe.</FieldDescription>
          </Field>
        </div>
      ) : null}

      <div>
        <p className="text-sm font-medium">Products</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter how much one child gets each week. A slip multiplies it by the centre’s child count
          {band > 1 ? `, rounded up to the next ${band}.` : '.'}
        </p>

        {draft.lines.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            No products yet. Until you add some, slips for these dates use each centre’s standing order.
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-lg border">
            {draft.lines.map((line, index) => {
              const example = exampleQuantity(line.quantityPerChild, {
                band, unit: line.unit, whole: productById.get(line.productId)?.isDecantable === false,
              });
              const options = products.filter((p) => String(p.id) === line.productId || !used.has(String(p.id)));
              return (
                // Lines have no id of their own until saved, and a product can only appear once.
                <li key={line.productId || `blank-${index}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Select
                    value={line.productId || undefined}
                    onValueChange={(productId) => setLine(index, { productId, unit: productById.get(productId)?.defaultUnit || 'kg' })}
                  >
                    <SelectTrigger className="min-w-48 flex-1" aria-label={`Product for line ${index + 1}`}>
                      <SelectValue placeholder="Choose a product">{productById.get(line.productId)?.name}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" inputMode="decimal" min="0" step="any" className="w-24 tabular-nums"
                    aria-label={`Amount per child for line ${index + 1}`} placeholder="0.30"
                    value={line.quantityPerChild}
                    onChange={(e) => setLine(index, { quantityPerChild: e.target.value })}
                  />
                  <span className="w-28 text-sm text-muted-foreground">{line.unit ? `${line.unit} per child` : 'per child'}</span>
                  <span className="w-64 text-sm tabular-nums text-muted-foreground">
                    {example !== null ? `${example} ${line.unit} ${exampleCentre({ band })}` : ''}
                  </span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove line ${index + 1}`} onClick={() => removeLine(index)}>
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addLine} disabled={used.size >= products.length}>
          <Plus /> Add product
        </Button>
      </div>

      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={busy || !changed} loading={busy}>
          {busy ? 'Saving…' : isNew ? 'Create recipe' : 'Save recipe'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy || !changed} onClick={() => { setDraft(initial); setError(null); }}>
          Undo changes
        </Button>
        {!isNew && isOverride ? (
          confirmDelete ? (
            <>
              <Button type="button" variant="destructive" disabled={busy} onClick={remove}>Delete it</Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep it</Button>
            </>
          ) : (
            <Button type="button" variant="outline" className="ml-auto" disabled={busy} onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete recipe
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

// ── Centres that keep their own order ─────────────────────────
function OwnOrderCard({ own, centres, onSaved }) {
  const toast = useToast();
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ownIds = new Set(own.map((c) => c.id));
  const available = centres.filter((c) => !ownIds.has(c.id));

  const saveList = async (ids, title) => {
    setBusy(true); setError(null);
    try {
      onSaved(await saveOwnOrderCentres(ids));
      setAdding('');
      toast({ variant: 'success', title });
    } catch (err) {
      setError(err.message || 'Could not save the centres.');
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Centres with their own order</CardTitle>
        <CardDescription>
          Add a centre here to keep its standing order. Its slips ignore the recipes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {own.length === 0 ? (
          <p className="text-sm text-muted-foreground">None. Every centre with a child count uses the recipes.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {own.map((centre) => (
              <li key={centre.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 break-words text-sm">{centre.name}</span>
                <Button
                  type="button" variant="ghost" size="sm" disabled={busy}
                  onClick={() => saveList(own.filter((c) => c.id !== centre.id).map((c) => c.id), `${centre.name} now uses the recipes`)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={adding || undefined} onValueChange={setAdding}>
            <SelectTrigger className="min-w-56 flex-1" aria-label="Centre to add">
              <SelectValue placeholder="Choose a centre">{centres.find((c) => String(c.id) === adding)?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {available.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            type="button" variant="outline" disabled={!adding || busy}
            onClick={() => saveList([...own.map((c) => c.id), Number(adding)], 'Centre added')}
          >
            <Plus /> Add centre
          </Button>
        </div>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

// ── The section ───────────────────────────────────────────────
export default function RecipesSection({ settings = null, onSettingsSaved }) {
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [centres, setCentres] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);   // a recipe id as a string, or NEW

  useEffect(() => {
    let cancelled = false;
    getRecipes()
      .then((overview) => { if (!cancelled) setData(overview); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load recipes.'); });
    // Each surfaced only where it is used: a failure costs one picker.
    productAPI.getProducts({ includeInactive: false })
      .then((rows) => { if (!cancelled) setProducts(rows); }).catch(() => {});
    beneficiaryAPI.getBeneficiaries({ includeInactive: false })
      .then((rows) => { if (!cancelled) setCentres(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Skeleton className="h-64 w-full" />;

  const current = data.recipes.find((r) => r.id === data.currentRecipeId) ?? null;
  // The band a child count is rounded up to. It lives with the other
  // admin settings (/api/settings), which the page has already loaded.
  const bandSettings = (settings ?? []).filter((s) => s.key === 'recipes.childBand');
  const band = Number(bandSettings[0]?.value ?? DEFAULT_CHILD_BAND);
  const selectedId = selected ?? String(current?.id ?? data.recipes[0]?.id ?? NEW);
  const recipe = data.recipes.find((r) => String(r.id) === selectedId) ?? null;

  const tabs = [
    ...data.recipes.map((r) => ({
      id: String(r.id),
      label: r.id === data.currentRecipeId ? `${r.name} · in use` : r.name,
    })),
    { id: NEW, label: 'New override' },
  ];

  // The override just created is the one whose id was not there before.
  const openCreated = (overview) => {
    const known = new Set(data.recipes.map((r) => r.id));
    const created = overview.recipes.find((r) => !known.has(r.id));
    setData(overview);
    setSelected(created ? String(created.id) : null);
  };

  return (
    <div className="space-y-6">
      <SeasonsCard key={JSON.stringify(data.recipes.map((r) => r.seasonStart))} recipes={data.recipes} currentRecipe={current} onSaved={setData} />

      {bandSettings.length > 0 ? (
        <AppSettingsSection
          title="Child count bands"
          description="Set the band centres are supplied in. With bands of 5, a centre of 21 to 25 children gets the slip for 25."
          settings={bandSettings}
          onSaved={onSettingsSaved}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recipes</CardTitle>
          <CardDescription>
            Set what goes on a picking slip. Add an override to replace the season’s recipe between two dates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ViewTabs label="Recipes" value={selectedId} onChange={setSelected} tabs={tabs} />
          {recipe?.kind === 'override' ? (
            <p className="text-sm text-muted-foreground">
              Replaces the season’s recipe from {dateLabel(recipe.startsOn)} to {dateLabel(recipe.endsOn)}.
            </p>
          ) : null}
          <RecipeEditor
            key={`${selectedId}-${recipe ? JSON.stringify(recipe) : 'new'}`}
            recipe={selectedId === NEW ? null : recipe}
            products={products}
            band={band}
            onSaved={setData}
            onCreated={openCreated}
            onDeleted={(overview) => { setData(overview); setSelected(null); }}
          />
        </CardContent>
      </Card>

      <OwnOrderCard own={data.ownOrderCentres} centres={centres} onSaved={setData} />
    </div>
  );
}
