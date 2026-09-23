import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const exportMocks = vi.hoisted(() => ({
  text: vi.fn(),
  rect: vi.fn(),
  roundedRect: vi.fn(),
  savePdf: vi.fn(),
  jsonToSheet: vi.fn((rows) => ({ rows })),
  bookNew: vi.fn(() => ({ sheets: [] })),
  bookAppendSheet: vi.fn(),
  writeFile: vi.fn(),
}));

const api = {
  getFinanceReport: vi.fn(),
};

vi.mock('../services/financeAPI', () => api);
vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function jsPDF() {
    return {
      internal: {
        pageSize: {
          getWidth: () => 210,
          getHeight: () => 297,
        },
      },
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      setDrawColor: vi.fn(),
      setFillColor: vi.fn(),
      line: vi.fn(),
      rect: exportMocks.rect,
      roundedRect: exportMocks.roundedRect,
      text: exportMocks.text,
      save: exportMocks.savePdf,
    };
  }),
}));
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: exportMocks.jsonToSheet,
    book_new: exportMocks.bookNew,
    book_append_sheet: exportMocks.bookAppendSheet,
  },
  writeFile: exportMocks.writeFile,
}));
vi.mock('../features/taskdashboard/components/ManagerLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const { default: FinanceWarehouseReportPage } = await import('../pages/FinanceWarehouseReportPage');

const REPORT = {
  movements: [
    {
      movement_type: 'received',
      reference_id: '15',
      movement_date: '2026-09-03',
      source_destination: 'Meridian Foods',
      product: 'Rice',
      quantity: '10',
      unit: 'bag',
      monetary_value: '1250.00',
    },
    {
      movement_type: 'received',
      reference_id: '16',
      movement_date: '2026-09-12',
      source_destination: 'Cape Foods',
      product: 'Oil',
      quantity: '3',
      unit: 'case',
      monetary_value: '750.00',
    },
    {
      movement_type: 'donated',
      reference_id: '22',
      movement_date: '2026-09-04',
      source_destination: 'Nandi Trust',
      product: 'Beans',
      quantity: '5',
      unit: 'box',
      monetary_value: null,
    },
    {
      movement_type: 'donated',
      reference_id: '23',
      movement_date: '2026-09-06',
      source_destination: 'Ubuntu Foods',
      product: 'Lentils',
      quantity: '2',
      unit: 'bag',
      monetary_value: null,
    },
    {
      movement_type: 'dispatched',
      reference_id: '31',
      movement_date: '2026-09-05',
      source_destination: 'Little Stars ECD',
      product: 'Maize Meal',
      quantity: '-8',
      unit: 'kg',
      monetary_value: null,
    },
  ],
  donationValues: [
    {
      movement_type: 'donated',
      reference_id: '22',
      donation_item_id: '220',
      movement_date: '2026-09-04',
      source_destination: 'Nandi Trust',
      product: 'Beans',
      quantity: '5',
      unit: 'box',
      monetary_value: '500.00',
    },
    {
      movement_type: 'donated',
      reference_id: '23',
      donation_item_id: '230',
      movement_date: '2026-09-06',
      source_destination: 'Ubuntu Foods',
      product: 'Lentils',
      quantity: '2',
      unit: 'bag',
      monetary_value: '300.00',
    },
  ],
  totals: {
    donations: '800.00',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getFinanceReport.mockResolvedValue(REPORT);
  URL.createObjectURL = vi.fn(() => 'blob:finance-export');
  URL.revokeObjectURL = vi.fn();
});

const expectedThisMonthRange = () => {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    limit: 200,
  };
};

describe('FinanceWarehouseReportPage', () => {
  it('loads this month by default', async () => {
    render(<FinanceWarehouseReportPage />);

    await waitFor(() => expect(api.getFinanceReport).toHaveBeenCalled());
    expect(api.getFinanceReport).toHaveBeenCalledWith(expectedThisMonthRange());
  });

  it('renders movement summary cards with known monetary totals', async () => {
    render(<FinanceWarehouseReportPage />);

    await screen.findByText('Movement Trends');

    const poCard = screen.getAllByText('Purchase Orders')
      .find((element) => element.closest('[data-slot="card"]')?.textContent.includes('Known purchase order value'))
      .closest('[data-slot="card"]');
    expect(within(poCard).getByText('2')).toBeInTheDocument();
    expect(within(poCard).getByText('Known purchase order value')).toBeInTheDocument();
    expect(within(poCard).getByText('R 2 000,00')).toBeInTheDocument();

    const donationCard = screen.getAllByText('Donations')
      .find((element) => element.closest('[data-slot="card"]')?.textContent.includes('Known donation value'))
      .closest('[data-slot="card"]');
    expect(within(donationCard).getByText('2')).toBeInTheDocument();
    expect(within(donationCard).getByText('Known donation value')).toBeInTheDocument();
    expect(within(donationCard).getByText('R 800,00')).toBeInTheDocument();

    const dispatchCard = screen.getByText('Dispatches').closest('[data-slot="card"]');
    expect(within(dispatchCard).getAllByText('1')).toHaveLength(2);
  });

  it('renders a grouped movement chart with visible legend labels', async () => {
    render(<FinanceWarehouseReportPage />);

    expect(await screen.findByText('Movement Trends')).toBeInTheDocument();
    const legend = screen.getByLabelText('Chart legend');
    expect(within(legend).getByText('Donations')).toBeInTheDocument();
    expect(within(legend).getByText('Purchase Orders')).toBeInTheDocument();
    expect(within(legend).getByText('Dispatch')).toBeInTheDocument();
    expect(screen.queryByText('Meridian Foods')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows only the chosen searchable donation list after View List selection', async () => {
    const user = userEvent.setup();

    render(<FinanceWarehouseReportPage />);

    expect(await screen.findByText('Movement Trends')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View List' }));
    await user.click(screen.getByRole('button', { name: 'Donations' }));

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'date' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'ref' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'donor' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'product' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'qty' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'unit' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'estimated value' })).toBeInTheDocument();
    expect(within(table).getByText('Nandi Trust')).toBeInTheDocument();
    expect(within(table).getByText('R 500,00')).toBeInTheDocument();
    expect(within(table).getByText('Ubuntu Foods')).toBeInTheDocument();
    expect(within(table).getByText('R 300,00')).toBeInTheDocument();
    expect(within(table).queryByText('Meridian Foods')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Search list'), 'rice');
    expect(within(table).getByText('No matching movements.')).toBeInTheDocument();
  });

  it('switches the list between purchase orders and dispatches with the right fields', async () => {
    const user = userEvent.setup();

    render(<FinanceWarehouseReportPage />);

    await screen.findByText('Movement Trends');
    await user.click(screen.getByRole('button', { name: 'View List' }));
    await user.click(screen.getByRole('button', { name: 'Purchase Orders' }));

    let table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'supplier' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'value' })).toBeInTheDocument();
    expect(within(table).getByText('Meridian Foods')).toBeInTheDocument();
    expect(within(table).getByText('Cape Foods')).toBeInTheDocument();
    expect(within(table).queryByText('Little Stars ECD')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View List' }));
    await user.click(screen.getByRole('button', { name: 'Dispatches' }));

    table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'ECD/destination' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'value' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'estimated value' })).not.toBeInTheDocument();
    expect(within(table).getByText('Little Stars ECD')).toBeInTheDocument();
    expect(within(table).getByText('8')).toBeInTheDocument();
    expect(within(table).getByText('kg')).toBeInTheDocument();
  });

  it('exports the graph/report view as a PDF', async () => {
    const user = userEvent.setup();

    render(<FinanceWarehouseReportPage />);

    await screen.findByText('Movement Trends');
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));

    await waitFor(() => expect(exportMocks.text).toHaveBeenCalledWith('Warehouse Movement Report', expect.any(Number), expect.any(Number)));
    expect(exportMocks.text).toHaveBeenCalledWith('This Month | Any to Any | All Types', expect.any(Number), expect.any(Number));
    expect(exportMocks.text).toHaveBeenCalledWith('Movement Trends', expect.any(Number), expect.any(Number));
    expect(exportMocks.text).toHaveBeenCalledWith('R\u00a0800,00', expect.any(Number), expect.any(Number), expect.objectContaining({ align: 'right' }));
    expect(exportMocks.text).toHaveBeenCalledWith('1', expect.any(Number), expect.any(Number), expect.any(Object));
    expect(exportMocks.rect).toHaveBeenCalled();
    expect(exportMocks.roundedRect).toHaveBeenCalled();
    expect(exportMocks.savePdf).toHaveBeenCalledWith(expect.stringMatching(/^finance-report-\d{4}-\d{2}-\d{2}\.pdf$/));
  });

  it('exports only the selected searched list as CSV and Excel', async () => {
    const user = userEvent.setup();
    const originalCreateElement = document.createElement.bind(document);
    let exportedAnchor;

    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const element = originalCreateElement(tagName, options);
      if (tagName === 'a') {
        exportedAnchor = element;
        vi.spyOn(element, 'click').mockImplementation(() => {});
      }
      return element;
    });

    render(<FinanceWarehouseReportPage />);

    await screen.findByText('Movement Trends');
    await user.click(screen.getByRole('button', { name: 'View List' }));
    await user.click(screen.getByRole('button', { name: 'Purchase Orders' }));
    await user.type(screen.getByLabelText('Search list'), 'Cape');

    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    const csv = await URL.createObjectURL.mock.calls[0][0].text();
    expect(csv).toContain('"Cape Foods"');
    expect(csv).toContain('"Oil"');
    expect(csv).not.toContain('Meridian Foods');
    expect(csv).not.toContain('Nandi Trust');
    expect(csv).not.toContain('Little Stars ECD');
    expect(exportedAnchor.download).toMatch(/^finance-purchase-orders-\d{4}-\d{2}-\d{2}\.csv$/);

    await user.click(screen.getByRole('button', { name: 'Export Excel' }));

    await waitFor(() => expect(exportMocks.writeFile).toHaveBeenCalled());
    expect(exportMocks.jsonToSheet).toHaveBeenCalledWith([
      {
        date: '12 Sept 2026',
        ref: '16',
        supplier: 'Cape Foods',
        product: 'Oil',
        qty: '3',
        unit: 'case',
        value: 'R\u00a0750,00',
      },
    ]);
    expect(exportMocks.writeFile).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringMatching(/^finance-purchase-orders-\d{4}-\d{2}-\d{2}\.xlsx$/),
    );
  });

  it('updates summaries and chart when type and date filters change', async () => {
    const user = userEvent.setup();

    render(<FinanceWarehouseReportPage />);

    expect(await screen.findByLabelText(/movement chart/i)).toHaveAccessibleName(
      'Movement chart. Donations 2. Purchase Orders 2. Dispatch 1.',
    );

    await user.click(screen.getByLabelText('Movement type'));
    await user.click(screen.getByRole('option', { name: 'Donations' }));

    expect(screen.getByLabelText(/movement chart/i)).toHaveAccessibleName(
      'Movement chart. Donations 2. Purchase Orders 0. Dispatch 0.',
    );

    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '2026-09-05');

    expect(screen.getByLabelText(/movement chart/i)).toHaveAccessibleName(
      'Movement chart. Donations 1. Purchase Orders 0. Dispatch 0.',
    );
    expect(screen.queryByText('No movements match these filters.')).not.toBeInTheDocument();
  });

  it('surfaces load failures without dropping the page title', async () => {
    api.getFinanceReport.mockRejectedValueOnce(new Error('Finance report unavailable'));

    render(<FinanceWarehouseReportPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Finance report unavailable');
    expect(screen.getByText('Warehouse Movement Report')).toBeInTheDocument();
  });
});
