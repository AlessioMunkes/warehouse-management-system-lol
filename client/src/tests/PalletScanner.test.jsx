// ─────────────────────────────────────────────────────────────
// client/src/tests/PalletScanner.test.jsx
//
// The camera component and how it fails. The library is replaced by a
// stand-in that lets a test decide what the camera does, because a real
// camera does not exist here and the failures are the point: every way
// the camera can be unavailable must end in a reason, never a blank box
// or a spinner that never stops.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { classifyCameraError } from '../features/scan/cameraErrors';

// What the stand-in camera does next. A test sets this before rendering.
const camera = {
  start: null,       // (config, onRead) => Promise
  stop: vi.fn(),
  clear: vi.fn(),
  lastRead: null,    // the read callback the scanner was started with
  constructed: [],
};

vi.mock('html5-qrcode', () => ({
  Html5QrcodeSupportedFormats: { QR_CODE: 0, CODE_128: 5, EAN_13: 9, EAN_8: 10, UPC_A: 14, UPC_E: 15 },
  Html5Qrcode: class {
    constructor(id, options) { camera.constructed.push({ id, options }); }
    async start(facing, config, onRead) {
      camera.lastRead = onRead;
      camera.facing = facing;
      camera.config = config;
      camera.starts?.push(config);
      return camera.start(config, onRead);
    }
    async stop() { return camera.stop(); }
    clear() { return camera.clear(); }
    async applyVideoConstraints(c) { camera.applied = c; }
    getRunningTrackCameraCapabilities() { return camera.caps; }
  },
}));

const PalletScanner = (await import('../features/scan/PalletScanner')).default;

const domError = (name, message = name) => Object.assign(new Error(message), { name });

const mount = (props = {}) => {
  const handlers = { onCode: vi.fn(), onUnavailable: vi.fn(), onReady: vi.fn(), ...props };
  const view = render(<PalletScanner label="Camera" {...handlers} />);
  return { handlers, ...view };
};

// Let the dynamic import and the start promise settle.
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

const hadMediaDevices = Object.getOwnPropertyDescriptor(globalThis.navigator, 'mediaDevices');
const withCamera = (present) => Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  configurable: true,
  value: present ? { getUserMedia: vi.fn() } : undefined,
});

beforeEach(() => {
  vi.clearAllMocks();
  camera.constructed.length = 0;
  camera.lastRead = null;
  camera.start = vi.fn().mockResolvedValue(undefined);
  camera.stop = vi.fn().mockResolvedValue(undefined);
  camera.clear = vi.fn();
  camera.applied = null;
  camera.starts = [];
  camera.caps = { torchFeature: () => ({ isSupported: () => false, apply: vi.fn() }) };
  withCamera(true);
});

afterEach(() => {
  vi.useRealTimers();
  if (hadMediaDevices) Object.defineProperty(globalThis.navigator, 'mediaDevices', hadMediaDevices);
  else delete globalThis.navigator.mediaDevices;
});

describe('classifyCameraError', () => {
  it.each([
    [domError('NotAllowedError', 'Permission denied'), 'denied'],
    [domError('PermissionDeniedError'), 'denied'],
    ['NotAllowedError: Permission dismissed', 'denied'],
    [domError('NotFoundError', 'Requested device not found'), 'noCamera'],
    [domError('OverconstrainedError'), 'noCamera'],
    ['Error getting userMedia, error = NotFoundError: no camera', 'noCamera'],
    [domError('NotReadableError', 'Could not start video source'), 'failed'],
    [new Error('Camera streaming not supported by the browser.'), 'failed'],
    ['something else entirely', 'failed'],
    [undefined, 'failed'],
    [null, 'failed'],
  ])('reads %j as %s', (error, reason) => {
    expect(classifyCameraError(error)).toBe(reason);
  });
});

describe('PalletScanner: the camera works', () => {
  it('starts the back camera, reading QR codes only, and says when it is ready', async () => {
    const { handlers } = mount();
    await settle();

    expect(camera.facing).toEqual({ facingMode: 'environment' });
    expect(camera.constructed[0].options.formatsToSupport).toEqual([0]);   // QR_CODE only
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
    expect(handlers.onUnavailable).not.toHaveBeenCalled();
  });

  it('draws into a labelled frame', async () => {
    const { container } = mount();
    await settle();
    const frame = container.querySelector('.scan-view');
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('aria-label')).toBe('Camera');
    expect(frame.id).toBe(camera.constructed[0].id);
  });

  it('hands over what it reads', async () => {
    const { handlers } = mount();
    await settle();

    camera.lastRead('https://x.test/slip/cc950bab-34b2-4606-81c3-a82973b54530');
    expect(handlers.onCode).toHaveBeenCalledWith('https://x.test/slip/cc950bab-34b2-4606-81c3-a82973b54530');
  });

  // A phone held over a code reads it dozens of times a second.
  it('does not repeat itself while the phone is held over the same code', async () => {
    const { handlers } = mount();
    await settle();

    for (let i = 0; i < 30; i += 1) camera.lastRead('b54530');
    expect(handlers.onCode).toHaveBeenCalledTimes(1);
  });

  it('reads again after a pause, so a second scan of a wrong code can be answered again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const { handlers } = mount();
    await vi.waitFor(() => expect(camera.lastRead).not.toBeNull());

    camera.lastRead('nope');
    now.mockReturnValue(1_000_000 + 2000);
    camera.lastRead('nope');
    expect(handlers.onCode).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('reads product barcodes through a wide window in product mode', async () => {
    mount({ kind: 'product' });
    await settle();
    expect(camera.constructed[0].options.formatsToSupport).toEqual([9, 10, 14, 15, 5]);
    expect(camera.config.qrbox(400, 600)).toEqual({ width: 380, height: 240 });
  });

  // What makes thin retail bars quick to read (PalletScanner's header).
  it('asks for a sharper picture, more tries a second, no mirrored retry, and continuous focus', async () => {
    mount({ kind: 'product' });
    await settle();
    expect(camera.config).toMatchObject({
      fps: 20, disableFlip: true,
      videoConstraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    expect(camera.applied).toEqual({ advanced: [{ focusMode: 'continuous' }] });
  });

  it('keeps pallet QR scanning as it was', async () => {
    mount();
    await settle();
    expect(camera.config.fps).toBe(10);
    expect(camera.config.videoConstraints).toBeUndefined();
    expect(camera.config.disableFlip).toBeUndefined();
  });

  it('starts with the camera’s defaults when it cannot give the sharper picture', async () => {
    camera.start = vi.fn()
      .mockRejectedValueOnce(domError('OverconstrainedError'))
      .mockResolvedValue(undefined);
    const { handlers } = mount({ kind: 'product' });
    await settle();
    expect(camera.starts).toHaveLength(2);
    expect(camera.starts[1].videoConstraints).toBeUndefined();
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
    expect(handlers.onUnavailable).not.toHaveBeenCalled();
  });

  it('offers the torch when the camera has one, and turns it on and off', async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    camera.caps = { torchFeature: () => ({ isSupported: () => true, apply }) };
    const { getByRole } = mount({ kind: 'product', torchLabel: 'Torch' });
    await settle();
    const button = getByRole('button', { name: 'Torch' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await act(async () => { button.click(); });
    expect(apply).toHaveBeenLastCalledWith(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no torch button on a camera without one', async () => {
    const { queryByRole } = mount({ kind: 'product', torchLabel: 'Torch' });
    await settle();
    expect(queryByRole('button', { name: 'Torch' })).toBeNull();
  });

  // Holding one box over the camera is one count; the next identical
  // box, brought in after the first has gone, is another.
  it('counts a held product code once, and again once it has left the frame', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const { handlers } = mount({ kind: 'product' });
    await settle();

    for (let i = 0; i < 20; i += 1) {
      now.mockReturnValue(1_000_000 + i * 100);
      camera.lastRead('4006381333931');
    }
    expect(handlers.onCode).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 1900 + 900);
    camera.lastRead('4006381333931');
    expect(handlers.onCode).toHaveBeenCalledTimes(2);

    camera.lastRead('96385074');
    expect(handlers.onCode).toHaveBeenCalledTimes(3);
    now.mockRestore();
  });

  it('stops and clears the camera when it goes away', async () => {
    const { unmount } = mount();
    await settle();
    unmount();
    await settle();

    expect(camera.stop).toHaveBeenCalledTimes(1);
    expect(camera.clear).toHaveBeenCalledTimes(1);
  });

  it('ignores reads that arrive after it was closed', async () => {
    const { handlers, unmount } = mount();
    await settle();
    unmount();

    camera.lastRead('b54530');
    expect(handlers.onCode).not.toHaveBeenCalled();
  });
});

describe('PalletScanner: the camera is not available', () => {
  it.each([
    ['permission refused',          domError('NotAllowedError', 'Permission denied'), 'denied'],
    ['no camera on the device',     domError('NotFoundError', 'Requested device not found'), 'noCamera'],
    ['the camera is in use',        domError('NotReadableError', 'Could not start video source'), 'failed'],
    ['the library throws a string', 'Camera streaming not supported', 'failed'],
  ])('reports %s', async (_label, error, reason) => {
    camera.start = vi.fn().mockRejectedValue(error);
    const { handlers } = mount();
    await settle();

    expect(handlers.onUnavailable).toHaveBeenCalledTimes(1);
    expect(handlers.onUnavailable).toHaveBeenCalledWith(reason);
    expect(handlers.onReady).not.toHaveBeenCalled();
  });

  it('reports a browser with no camera API (an insecure page, say) without trying', async () => {
    withCamera(false);
    const { handlers } = mount();
    await settle();

    expect(handlers.onUnavailable).toHaveBeenCalledWith('failed');
    expect(camera.constructed).toHaveLength(0);
  });

  // Never a spinner that does not stop.
  it('gives up on a camera that never answers, and stops it if it comes up late', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let comeUp;
    camera.start = vi.fn(() => new Promise((resolve) => { comeUp = resolve; }));
    const { handlers } = mount();
    await vi.waitFor(() => expect(camera.start).toHaveBeenCalled());

    await act(async () => { await vi.advanceTimersByTimeAsync(20_001); });
    expect(handlers.onUnavailable).toHaveBeenCalledWith('failed');

    await act(async () => { comeUp(); });
    expect(handlers.onReady).not.toHaveBeenCalled();
    expect(camera.stop).toHaveBeenCalled();         // it did start: do not leave it running
  });

  it('reports only once however the camera fails', async () => {
    camera.start = vi.fn().mockRejectedValue(domError('NotAllowedError'));
    const { handlers } = mount();
    await settle();
    await settle();
    expect(handlers.onUnavailable).toHaveBeenCalledTimes(1);
  });
});

describe('PalletScanner: closed while still starting', () => {
  it('stops a camera that comes up after the panel was closed', async () => {
    let comeUp;
    camera.start = vi.fn(() => new Promise((resolve) => { comeUp = resolve; }));
    const { handlers, unmount } = mount();
    await vi.waitFor(() => expect(camera.start).toHaveBeenCalled());

    unmount();
    await act(async () => { comeUp(); });

    expect(camera.stop).toHaveBeenCalled();
    expect(handlers.onReady).not.toHaveBeenCalled();
  });
});

// Last, because it resets the module registry.
describe('PalletScanner: the library itself', () => {
  it('reports a library that will not load', async () => {
    vi.resetModules();
    vi.doMock('html5-qrcode', () => { throw new Error('chunk failed to load'); });
    const Broken = (await import('../features/scan/PalletScanner')).default;
    const onUnavailable = vi.fn();
    render(<Broken label="Camera" onCode={vi.fn()} onUnavailable={onUnavailable} />);
    await settle();

    expect(onUnavailable).toHaveBeenCalledWith('failed');
    vi.doUnmock('html5-qrcode');
  });
});
