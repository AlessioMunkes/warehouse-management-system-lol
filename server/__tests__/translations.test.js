// Settings → Translations: an admin's own Afrikaans / isiXhosa wording.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = { list: vi.fn(), save: vi.fn(async (row) => row), remove: vi.fn(async () => true) };
vi.mock('../src/repositories/translation.repository.js', () => ({ default: repo }));
const service = (await import('../src/services/translation.service.js')).default;

beforeEach(() => { vi.clearAllMocks(); });

describe('overrides', () => {
  it('groups rows the way the app looks them up', async () => {
    repo.list.mockResolvedValue([
      { language: 'af', kind: 'key', source: 'packing.claim', text: 'Neem' },
      { language: 'xh', kind: 'phrase', source: 'Cancel', text: 'Yeka' },
    ]);
    expect(await service.overrides()).toEqual({
      key: { af: { 'packing.claim': 'Neem' }, xh: {} },
      phrase: { af: {}, xh: { Cancel: 'Yeka' } },
    });
  });

  it('gives no overrides, never an error, when the table cannot be read', async () => {
    repo.list.mockRejectedValue(new Error('relation "translation_overrides" does not exist'));
    expect(await service.overrides()).toEqual({ key: { af: {}, xh: {} }, phrase: { af: {}, xh: {} } });
  });
});

describe('save', () => {
  it('saves trimmed wording for a key or a phrase', async () => {
    await service.save({ language: 'af', kind: 'key', source: 'packing.claim', text: '  Neem dit  ' }, 7);
    expect(repo.save).toHaveBeenCalledWith({ language: 'af', kind: 'key', source: 'packing.claim', text: 'Neem dit' }, 7);
    await service.save({ language: 'xh', kind: 'phrase', source: 'Cancel', text: 'Yeka' }, 7);
    expect(repo.save).toHaveBeenLastCalledWith({ language: 'xh', kind: 'phrase', source: 'Cancel', text: 'Yeka' }, 7);
  });

  it('accepts the one / other halves of counted wording', async () => {
    await service.save({ language: 'af', kind: 'key', source: 'guest.done.problems#one', text: 'een probleem' }, 1);
    expect(repo.save).toHaveBeenCalled();
  });

  it('refuses English, unknown kinds, bad keys and empty wording', async () => {
    await expect(service.save({ language: 'en', kind: 'key', source: 'a.b', text: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(service.save({ language: 'af', kind: 'other', source: 'a.b', text: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(service.save({ language: 'af', kind: 'key', source: 'not a key!', text: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(service.save({ language: 'af', kind: 'key', source: 'a.b', text: '   ' })).rejects.toMatchObject({ status: 400 });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('keeps the placeholders the app fills in', async () => {
    await expect(service.save({
      language: 'af', kind: 'key', source: 'packing.itemsPacked', text: 'items gepak', placeholders: ['done', 'all'],
    })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/\{all\} \{done\}/) });
    await service.save({
      language: 'af', kind: 'key', source: 'packing.itemsPacked', text: '{done}/{all} items gepak', placeholders: ['done', 'all'],
    });
    await expect(service.save({
      language: 'xh', kind: 'phrase', source: 'Pallet {}', text: 'Ipalethi', placeholders: ['{}'],
    })).rejects.toMatchObject({ status: 400 });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
});

describe('reset', () => {
  it('removes the override so the built-in wording shows again', async () => {
    expect(await service.reset({ language: 'af', kind: 'phrase', source: 'Cancel' })).toMatchObject({ reset: true });
    expect(repo.remove).toHaveBeenCalledWith({ language: 'af', kind: 'phrase', source: 'Cancel' });
  });
});
