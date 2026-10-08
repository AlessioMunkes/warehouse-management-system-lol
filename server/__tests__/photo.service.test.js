// ─────────────────────────────────────────────────────────────
// server/__tests__/photo.service.test.js
//
// What may be saved as a floor photo: a real, small picture of a record
// that exists. The repository is mocked.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = { insert: vi.fn(), listFor: vi.fn(), getImage: vi.fn(), entityExists: vi.fn() };
vi.mock('../src/repositories/photo.repository.js', () => ({ default: repo }));

const { default: photoService, MAX_BYTES } = await import('../src/services/photo.service.js');

// A JPEG as far as its first and last bytes go, which is what the service checks.
const jpeg = (size = 2000) => { const b = Buffer.alloc(size, 1); b[0] = 0xff; b[1] = 0xd8; b[size - 2] = 0xff; b[size - 1] = 0xd9; return b; };
const dataUrl = (bytes, type = 'image/jpeg') => `data:${type};base64,${bytes.toString('base64')}`;
const ROW = { id: '5', entity_type: 'picking_slip_item', entity_id: 12, content_type: 'image/jpeg', byte_size: 2000, created_at: '2026-10-09T08:00:00Z', created_by: 7 };

beforeEach(() => {
  vi.clearAllMocks();
  repo.entityExists.mockResolvedValue(true);
  repo.insert.mockResolvedValue(ROW);
});

describe('addPhoto', () => {
  it('keeps a small photo of a record that exists', async () => {
    const photo = await photoService.addPhoto({ entityType: 'picking_slip_item', entityId: 12, dataUrl: dataUrl(jpeg()) }, 7);

    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'picking_slip_item', entityId: 12, contentType: 'image/jpeg', userId: 7 }));
    expect(repo.insert.mock.calls[0][0].data.length).toBe(2000);
    expect(photo).toMatchObject({ id: 5, entityId: 12, url: '/api/photos/5/image' });
  });

  it('refuses a photo of nothing, or of something that is not there', async () => {
    await expect(photoService.addPhoto({ entityType: 'pallet', entityId: 1, dataUrl: dataUrl(jpeg()) }, 7)).rejects.toMatchObject({ status: 400 });
    await expect(photoService.addPhoto({ entityType: 'purchase_order', entityId: 'abc', dataUrl: dataUrl(jpeg()) }, 7)).rejects.toMatchObject({ status: 400 });
    repo.entityExists.mockResolvedValue(false);
    await expect(photoService.addPhoto({ entityType: 'purchase_order', entityId: 9, dataUrl: dataUrl(jpeg()) }, 7)).rejects.toMatchObject({ status: 404 });
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('refuses anything that is not really a picture', async () => {
    const notAPicture = Buffer.alloc(2000, '<script>alert(1)</script>');
    // Starts like a JPEG and stops: a few bytes, or a file cut off part-way.
    const stub = Buffer.from([0xff, 0xd8, 0xff]);
    const cutOff = jpeg().subarray(0, 1500);
    for (const bad of [undefined, 'hello', 'data:text/html;base64,PGI+', dataUrl(notAPicture), 'data:image/jpeg;base64,', dataUrl(stub), dataUrl(cutOff)]) {
      await expect(photoService.addPhoto({ entityType: 'purchase_order', entityId: 9, dataUrl: bad }, 7)).rejects.toMatchObject({ status: 400 });
    }
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('refuses a photo the phone did not shrink', async () => {
    await expect(photoService.addPhoto({ entityType: 'purchase_order', entityId: 9, dataUrl: dataUrl(jpeg(MAX_BYTES + 1)) }, 7))
      .rejects.toMatchObject({ status: 413 });
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('takes png and webp as well', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(1500), Buffer.from('IEND'), Buffer.alloc(4)]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(1500)]);
    await photoService.addPhoto({ entityType: 'purchase_order', entityId: 9, dataUrl: dataUrl(png, 'image/png') }, 7);
    await photoService.addPhoto({ entityType: 'purchase_order', entityId: 9, dataUrl: dataUrl(webp, 'image/webp') }, 7);
    expect(repo.insert).toHaveBeenCalledTimes(2);
  });
});

describe('listPhotos', () => {
  it('lists the photos of several records at once, without the pictures', async () => {
    repo.listFor.mockResolvedValue([{ ...ROW, created_by_name: 'Mcebisi Ndlovu' }]);
    const photos = await photoService.listPhotos({ entityType: 'picking_slip_item', entityIds: '12,13,12,x' });
    expect(repo.listFor).toHaveBeenCalledWith('picking_slip_item', [12, 13]);
    expect(photos).toEqual([expect.objectContaining({ id: 5, takenBy: 'Mcebisi Ndlovu', url: '/api/photos/5/image' })]);
    expect(photos[0].data).toBeUndefined();
  });

  it('is empty for no records, and refuses an unknown kind', async () => {
    expect(await photoService.listPhotos({ entityType: 'purchase_order', entityIds: '' })).toEqual([]);
    await expect(photoService.listPhotos({ entityType: 'nope', entityIds: '1' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('getImage', () => {
  it('hands back the picture, or 404', async () => {
    repo.getImage.mockResolvedValueOnce({ content_type: 'image/jpeg', data: jpeg() });
    expect((await photoService.getImage('5')).content_type).toBe('image/jpeg');
    repo.getImage.mockResolvedValueOnce(null);
    await expect(photoService.getImage('6')).rejects.toMatchObject({ status: 404 });
  });
});
