// ─────────────────────────────────────────────────────────────
// client/src/tests/ScanPanels.test.jsx
//
// The "Scan pallet QR" button on the volunteer's home and on the
// worker's packing screen: where a scan goes, what a code that is not
// ours says, and what the screen does when the camera cannot be used.
//
// The camera itself is replaced by a stand-in whose callbacks the test
// calls (PalletScanner.test.jsx covers the real component against a
// stand-in library); everything around it here is real.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { setLanguage } from '../translations';

// The stand-in camera: the latest props it was given.
const camera = { props: null, mounts: 0 };
vi.mock('../features/scan/PalletScanner', () => ({
  default: (props) => {
    camera.props = props;
    return <div data-testid="camera" aria-label={props.label} />;
  },
}));

vi.mock('../services/guestSlipAPI', () => ({
  fetchSlipPreview: vi.fn(),
  fetchSlipByCode: vi.fn(),
  claimSlipByToken: vi.fn(),
  claimSlipByCode: vi.fn(),
  claimSlipById: vi.fn(),
  fetchAvailableSlips: vi.fn(),
  fetchMySlip: vi.fn(),
  releaseMySlip: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../components/layout/StaffShell', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../features/packing/StaffSlipList', () => ({ default: () => <div>the pallet list</div> }));
vi.mock('../features/packing/StaffSlipFlow', () => ({ default: () => <div>one pallet</div> }));

const api = await import('../services/guestSlipAPI');
const { useAuth } = await import('../context/AuthContext');
const GuestHomePage = (await import('../pages/GuestHomePage')).default;
const PackingStaffPage = (await import('../pages/PackingStaffPage')).default;

const TOKEN = 'cc950bab-34b2-4606-81c3-a82973b54530';
const LINK = `https://wms-lol.onrender.com/slip/${TOKEN}`;

const pallet = {
  id: 21, beneficiaryName: 'Tiny Tots ECD', beneficiaryKind: 'ecd',
  dispatchDate: '2026-10-15', itemCount: 2, status: 'pending', isClaimed: false,
};

const Where = ({ label }) => {
  const { pathname, search } = useLocation();
  return <div>{`${label}:${pathname}${search}`}</div>;
};

const renderGuest = () => render(
  <MemoryRouter initialEntries={['/guest-home']}>
    <Routes>
      <Route path="/guest-home" element={<GuestHomePage />} />
      <Route path="/guest/pack" element={<Where label="packing" />} />
      <Route path="/slip/:token" element={<Where label="preview" />} />
    </Routes>
  </MemoryRouter>,
);

const renderStaff = () => render(
  <MemoryRouter initialEntries={['/noc/packing']}>
    <Routes>
      <Route path="/noc/packing" element={<PackingStaffPage />} />
      <Route path="/noc/packing/:slipId" element={<Where label="worker" />} />
    </Routes>
  </MemoryRouter>,
);

// What the camera does, as the screen sees it.
const cameraReady = () => act(async () => { camera.props.onReady(); });
const cameraSees = (text) => act(async () => { await camera.props.onCode(text); });
const cameraFails = (reason) => act(async () => { camera.props.onUnavailable(reason); });

const guestUser = { id: '11', firstName: 'Thabo', role: 'guest' };
const workerUser = { id: 5, firstName: 'Wanda', role: 'warehouse_worker' };

beforeEach(() => {
  vi.clearAllMocks();
  camera.props = null;
  api.fetchMySlip.mockRejectedValue(Object.assign(new Error('none'), { status: 404 }));
  api.fetchAvailableSlips.mockResolvedValue([pallet]);
  api.fetchSlipPreview.mockResolvedValue(pallet);
  api.fetchSlipByCode.mockResolvedValue(pallet);
  api.claimSlipByCode.mockResolvedValue({ slip: pallet });
  useAuth.mockReturnValue({ user: guestUser, isLoading: false, logout: vi.fn() });
});

afterEach(() => setLanguage('en'));

// ── The volunteer ─────────────────────────────────────────────
describe('guest home: Scan pallet QR', () => {
  const open = async () => {
    renderGuest();
    (await screen.findByRole('button', { name: 'Scan pallet QR' })).click();
    await screen.findByTestId('camera');
  };

  it('sits with the pallet list and the typed-code box', async () => {
    renderGuest();
    const scan = await screen.findByRole('button', { name: 'Scan pallet QR' });
    expect(scan).toBeInTheDocument();
    expect(screen.getByText('Pallets to pack')).toBeInTheDocument();
    expect(screen.getByLabelText('Pallet code')).toBeInTheDocument();
    // Big, like the other guest buttons: the 56 px target comes from this class.
    expect(scan.className).toContain('gst-btn');
  });

  it('is not offered to someone already packing a pallet', async () => {
    api.fetchMySlip.mockResolvedValue({
      id: 21, status: 'in_progress', ecd_name: 'Tiny Tots ECD',
      items: [{ id: 1, status: 'pending' }],
    });
    renderGuest();

    await screen.findByText('Your pallet in progress');
    expect(screen.queryByRole('button', { name: 'Scan pallet QR' })).not.toBeInTheDocument();
  });

  it('opens the camera with a title, a hint and a way to close it', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'Scan the pallet QR code' })).toHaveFocus();
    expect(screen.getByText(/hold your phone over the square code/i)).toBeInTheDocument();
    expect(screen.getByText('Starting the camera…')).toBeInTheDocument();

    await cameraReady();
    expect(screen.queryByText('Starting the camera…')).not.toBeInTheDocument();
  });

  it('closes again and puts focus back on the button', async () => {
    await open();
    screen.getByRole('button', { name: 'Close the camera' }).click();

    const button = await screen.findByRole('button', { name: 'Scan pallet QR' });
    expect(screen.queryByTestId('camera')).not.toBeInTheDocument();
    await waitFor(() => expect(button).toHaveFocus());
  });

  describe('what a scan does', () => {
    it('opens the pallet preview for the full link, as the QR does', async () => {
      await open();
      await cameraSees(LINK);
      expect(await screen.findByText(`preview:/slip/${TOKEN}`)).toBeInTheDocument();
      expect(api.claimSlipByCode).not.toHaveBeenCalled();
    });

    it('claims by code for the 6 characters, as typing them does, then goes to packing', async () => {
      await open();
      await cameraSees('B54530');

      await waitFor(() => expect(api.claimSlipByCode).toHaveBeenCalledWith('b54530'));
      expect(api.fetchSlipByCode).toHaveBeenCalledWith('b54530');
      expect(await screen.findByText('packing:/guest/pack')).toBeInTheDocument();
    });

    it.each([
      ['another site', 'https://example.com/'],
      ['a volunteer attendance code', 'https://vms.example.org/checkin/8d1f7c5e'],
      ['text', 'hello'],
    ])('says this is not a pallet code for %s, and touches nothing', async (_label, text) => {
      await open();
      await cameraSees(text);

      expect(await screen.findByText(/this isn’t a pallet code/i)).toBeInTheDocument();
      expect(api.fetchSlipPreview).not.toHaveBeenCalled();
      expect(api.fetchSlipByCode).not.toHaveBeenCalled();
      expect(api.claimSlipByCode).not.toHaveBeenCalled();
      expect(screen.queryByText(/preview:/)).not.toBeInTheDocument();
      // and the camera is still there to try again
      expect(screen.getByTestId('camera')).toBeInTheDocument();
    });

    it('shows the server’s words when the code matches no pallet, and stays open', async () => {
      api.fetchSlipByCode.mockRejectedValue(new Error('That code did not match a pallet. Check the code, or ask a staff member.'));
      await open();
      await cameraSees('b54530');

      expect(await screen.findByText(/did not match a pallet/i)).toBeInTheDocument();
      expect(screen.getByTestId('camera')).toBeInTheDocument();
      expect(api.claimSlipByCode).not.toHaveBeenCalled();
    });

    it('says when the pallet is taken, from the claim', async () => {
      api.claimSlipByCode.mockRejectedValue(new Error('Someone else is already packing that pallet. Ask a staff member for another one.'));
      await open();
      await cameraSees('b54530');

      expect(await screen.findByText(/someone else is already packing/i)).toBeInTheDocument();
    });
  });

  describe('when the camera cannot be used', () => {
    it.each([
      ['denied',   /camera is blocked/i],
      ['noCamera', /couldn’t find a camera/i],
      ['failed',   /camera would not start/i],
    ])('explains %s and points to the typed code', async (reason, wording) => {
      await open();
      await cameraFails(reason);

      expect(screen.getByText(wording)).toBeInTheDocument();
      expect(screen.getByText(wording).textContent).toMatch(/type the 6 characters/i);
      expect(screen.queryByTestId('camera')).not.toBeInTheDocument();
      expect(screen.queryByText('Starting the camera…')).not.toBeInTheDocument();
      // the typed box is on the same screen, not somewhere else
      expect(screen.getByLabelText('Pallet code')).toBeInTheDocument();
    });

    it('"Type the code instead" closes the camera and puts the cursor in the code box', async () => {
      await open();
      await cameraFails('denied');
      screen.getByRole('button', { name: 'Type the code instead' }).click();

      await waitFor(() => expect(screen.getByLabelText('Pallet code')).toHaveFocus());
      expect(screen.queryByRole('heading', { name: 'Scan the pallet QR code' })).not.toBeInTheDocument();
    });

    it('the typed code still works after a failed camera', async () => {
      await open();
      await cameraFails('failed');
      screen.getByRole('button', { name: 'Type the code instead' }).click();

      const box = screen.getByLabelText('Pallet code');
      const user = (await import('@testing-library/user-event')).default.setup();
      await user.type(box, 'b54530');
      await user.click(screen.getByRole('button', { name: 'Find this pallet' }));

      await waitFor(() => expect(api.claimSlipByCode).toHaveBeenCalledWith('b54530'));
    });
  });

  describe('in Afrikaans and isiXhosa', () => {
    it.each([
      ['af', 'Skandeer palet-QR', /kamera is geblokkeer/i],
      ['xh', 'Skena i-QR yepalethi', /ikhamera ivaliwe/i],
    ])('speaks %s', async (lang, button, blocked) => {
      setLanguage(lang);
      renderGuest();
      (await screen.findByRole('button', { name: button })).click();
      await screen.findByTestId('camera');
      await cameraFails('denied');

      expect(screen.getByText(blocked)).toBeInTheDocument();
    });
  });
});

// ── The worker ────────────────────────────────────────────────
describe('worker packing screen: Scan pallet QR', () => {
  beforeEach(() => useAuth.mockReturnValue({ user: workerUser, isLoading: false }));

  const open = async () => {
    renderStaff();
    (await screen.findByRole('button', { name: /Scan pallet QR/ })).click();
    await screen.findByTestId('camera');
  };

  it('is on the packing list, above the pallets', async () => {
    renderStaff();
    expect(await screen.findByRole('button', { name: /Scan pallet QR/ })).toBeInTheDocument();
    expect(screen.getByText('the pallet list')).toBeInTheDocument();
  });

  it('is not on a single pallet’s screen', async () => {
    render(
      <MemoryRouter initialEntries={['/noc/packing/21']}>
        <Routes><Route path="/noc/packing/:slipId" element={<PackingStaffPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('one pallet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Scan pallet QR/ })).not.toBeInTheDocument();
  });

  it('sends the full link to the packing screen for that slip', async () => {
    await open();
    await cameraSees(LINK);

    expect(await screen.findByText('worker:/noc/packing/21')).toBeInTheDocument();
    expect(api.fetchSlipPreview).toHaveBeenCalledWith(TOKEN);
    // nothing is claimed here: that is the packing screen's job
    expect(api.claimSlipByToken).not.toHaveBeenCalled();
    expect(api.claimSlipByCode).not.toHaveBeenCalled();
  });

  it('sends the 6 printed characters to the same place', async () => {
    await open();
    await cameraSees('b54530');

    expect(await screen.findByText('worker:/noc/packing/21')).toBeInTheDocument();
    expect(api.fetchSlipByCode).toHaveBeenCalledWith('b54530');
    expect(api.claimSlipByCode).not.toHaveBeenCalled();
  });

  it('says this is not a pallet code for anything else, and goes nowhere', async () => {
    await open();
    await cameraSees('https://example.com/');

    expect(await screen.findByText(/this isn’t a pallet code/i)).toBeInTheDocument();
    expect(api.fetchSlipPreview).not.toHaveBeenCalled();
    expect(screen.queryByText(/^worker:/)).not.toBeInTheDocument();
  });

  it('shows the server’s words when the pallet is not found', async () => {
    api.fetchSlipByCode.mockRejectedValue(new Error('That code did not match a pallet. Check the code, or ask a staff member.'));
    await open();
    await cameraSees('b54530');

    expect(await screen.findByText(/did not match a pallet/i)).toBeInTheDocument();
  });

  describe('typing the code', () => {
    const typeAndFind = async (text) => {
      const user = (await import('@testing-library/user-event')).default.setup();
      await user.type(screen.getByLabelText('Pallet code'), text);
      await user.click(screen.getByRole('button', { name: 'Find this pallet' }));
    };

    it('lands on the packing screen for that slip', async () => {
      await open();
      await typeAndFind('B54530');

      expect(await screen.findByText('worker:/noc/packing/21')).toBeInTheDocument();
      expect(api.fetchSlipByCode).toHaveBeenCalledWith('b54530');
    });

    it('asks for 6 characters when it is not a code', async () => {
      await open();
      await typeAndFind('b54');

      expect(await screen.findByText(/code is 6 characters/i)).toBeInTheDocument();
      expect(api.fetchSlipByCode).not.toHaveBeenCalled();
    });

    it('is there when the camera is not', async () => {
      await open();
      await cameraFails('denied');

      expect(screen.getByText(/camera is blocked/i).textContent).toMatch(/type the 6 characters/i);
      await typeAndFind('b54530');
      expect(await screen.findByText('worker:/noc/packing/21')).toBeInTheDocument();
    });
  });

  describe('when the camera cannot be used', () => {
    it.each([
      ['denied',   /camera is blocked/i],
      ['noCamera', /no camera on this device/i],
      ['failed',   /camera would not start/i],
    ])('explains %s and keeps the typed code', async (reason, wording) => {
      await open();
      await cameraFails(reason);

      expect(screen.getByText(wording)).toBeInTheDocument();
      expect(screen.queryByTestId('camera')).not.toBeInTheDocument();
      expect(screen.queryByText('Starting the camera…')).not.toBeInTheDocument();
      expect(within(screen.getByRole('region', { name: 'Scan the pallet QR code' })).getByLabelText('Pallet code')).toBeInTheDocument();
    });
  });

  it('speaks Afrikaans and isiXhosa', async () => {
    for (const [lang, button] of [['af', /Skandeer palet-QR/], ['xh', /Skena i-QR yepalethi/]]) {
      setLanguage(lang);
      const { unmount } = renderStaff();
      expect(await screen.findByRole('button', { name: button })).toBeInTheDocument();
      unmount();
    }
  });
});

// ── An admin has no pallet screen ─────────────────────────────
describe('a scan by someone with no pallet screen', () => {
  it('says so rather than going nowhere', async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'admin' }, isLoading: false });
    renderStaff();
    (await screen.findByRole('button', { name: /Scan pallet QR/ })).click();
    await screen.findByTestId('camera');
    await cameraSees(LINK);

    expect(await screen.findByText(/admins do not pack pallets/i)).toBeInTheDocument();
  });
});
