// This component is the inline form used to edit one donation category rule.
// It keeps the screen simple by editing the selected row in place, while still showing
// save and cancel actions and any validation errors returned by the API.
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STORAGE_OPTIONS = [
  'cold_room',
  'dry_store',
  'fts_section',
  'mezzanine',
  'boardroom',
  'Soup Kitchen Prep',
  'Mezzanine or Boardroom storage',
];

const formatCategoryLabel = (category = '') =>
  category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function CategoryRoutingEditor({
  rule,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}) {
  return (
    <div className="mt-6 rounded-[8px] border border-[#ef3a40]/30 bg-[#fff7f7] p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#2b3336]">
          Edit {formatCategoryLabel(rule.category)}
        </h2>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close edit form"
          onClick={onCancel}
          className="text-[#2b3336] hover:bg-white"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-[6px] border border-[#ef3a40] bg-[#fff1f0] px-3 py-2 text-sm text-[#2b3336]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-[#2b3336]">
            Routing outcome
          </label>
          <Input
            value={draft.routing_outcome ?? ''}
            onChange={(event) => onChange('routing_outcome', event.target.value)}
            placeholder="e.g. Donate to the soup kitchen"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#2b3336]">
            Storage area
          </label>

          <Select
            value={draft.storage_area ?? ''}
            onValueChange={(value) => onChange('storage_area', value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select storage area" />
            </SelectTrigger>

            <SelectContent>
              {STORAGE_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-[#2b3336]">
            Description
          </label>
          <Textarea
            value={draft.description ?? ''}
            onChange={(event) => onChange('description', event.target.value)}
            rows={4}
            placeholder="Notes about how this category should be managed"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>

        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
