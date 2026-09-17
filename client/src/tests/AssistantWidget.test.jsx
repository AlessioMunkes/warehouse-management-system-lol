// ─────────────────────────────────────────────────────────────
// client/src/tests/AssistantWidget.test.jsx
//
// The floating help button and the panel it opens.
//
// The API is mocked; what is being tested is that each of the four
// answer shapes the server can return renders as something a person
// can act on, and that the cheap paths stay cheap — a suggestion
// chip and a "related" link must not spend a model call on a topic
// the catalog can hand over directly.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AssistantLauncher from '../features/assistant/components/AssistantLauncher';

// Shows where the router actually is, so "it takes you there" can be
// asserted rather than inferred from a link's href.
function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

const api = {
  fetchAssistantCatalog: vi.fn(),
  fetchTopic: vi.fn(),
  askAssistant: vi.fn(),
};
vi.mock('../services/assistantAPI', () => ({
  fetchAssistantCatalog: (...a) => api.fetchAssistantCatalog(...a),
  fetchTopic:            (...a) => api.fetchTopic(...a),
  askAssistant:          (...a) => api.askAssistant(...a),
}));

const TOPIC = {
  id: 'receiving-record',
  title: 'Recording a delivery',
  body: 'Open Receiving and find the order.\n\nThe system shows what was expected.',
  steps: ['Choose the order.', 'Enter what arrived.'],
  related: [{ id: 'receiving-discrepancy', title: 'When the count does not match the order' }],
};

const renderAt = (path = '/noc/procurement') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <AssistantLauncher />
    </MemoryRouter>
  );

// jsdom has no layout, so matchMedia is undefined unless we say so.
// The panel uses it to decide whether to close after navigating:
// open on a computer (it sits beside the page), closed on a phone
// (it covers it).
const setViewport = (wide) => {
  window.matchMedia = (q) => ({
    matches: wide, media: q, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  });
};

const openPanel = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Help' }));
  return screen.findByRole('dialog');
};

beforeEach(() => {
  vi.clearAllMocks();
  setViewport(true);
  api.fetchAssistantCatalog.mockResolvedValue({
    enabled: true,
    suggestions: {
      receiving: [{ id: 'receiving-record', title: 'Recording a delivery' }],
      home:      [{ id: 'what-is-this',     title: 'What this system is for' }],
    },
  });
  api.fetchTopic.mockResolvedValue({ type: 'topic', topic: TOPIC });
  api.askAssistant.mockResolvedValue({ type: 'topic', topic: TOPIC });
});

describe('the floating button', () => {
  it('is there, labelled, and does not fetch anything until it is opened', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    // The launcher is on every authenticated screen. A catalog
    // request per page load, for a panel most people never open, is
    // a request per page load for nothing.
    expect(api.fetchAssistantCatalog).not.toHaveBeenCalled();
  });

  it('opens and closes the panel', async () => {
    renderAt();
    const panel = await openPanel();
    expect(within(panel).getByRole('textbox', { name: /ask a question/i })).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: /close help/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('reserves room for itself so it does not land on top of a toast', () => {
    renderAt();
    // Both live bottom-right. The toast stack adds this to its
    // offset; the control that would otherwise be covered is Undo.
    expect(document.documentElement.style.getPropertyValue('--wms-assistant-h')).toBeTruthy();
  });
});

describe('knowing which screen you are on', () => {
  it('offers the suggestions for that screen', async () => {
    renderAt('/noc/procurement');
    const panel = await openPanel();
    expect(await within(panel).findByRole('button', { name: 'Recording a delivery' }))
      .toBeInTheDocument();
  });

  it('sends the screen with the question', async () => {
    renderAt('/noc/procurement');
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'the truck is here');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));
    await waitFor(() =>
      expect(api.askAssistant).toHaveBeenCalledWith('the truck is here', 'receiving'));
  });

  // A deep route is still the screen it belongs to — someone inside
  // one picking slip is still on Packing.
  it('treats a detail route as its parent screen', async () => {
    renderAt('/noc/packing/42');
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'what goes on this');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));
    await waitFor(() =>
      expect(api.askAssistant).toHaveBeenCalledWith('what goes on this', 'packing'));
  });

  it('falls back to the general suggestions on a screen it does not know', async () => {
    renderAt('/somewhere-else');
    const panel = await openPanel();
    expect(await within(panel).findByRole('button', { name: 'What this system is for' }))
      .toBeInTheDocument();
  });
});

describe('the four things an answer can be', () => {
  it('renders a topic with its paragraphs, steps and related links', async () => {
    renderAt();
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'how do I receive');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));

    expect(await within(panel).findByText('Recording a delivery')).toBeInTheDocument();
    expect(within(panel).getByText(/The system shows what was expected/)).toBeInTheDocument();
    expect(within(panel).getByText('Enter what arrived.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /count does not match/i })).toBeInTheDocument();
  });

  it('actually takes you there, and says so', async () => {
    setViewport(true);
    api.askAssistant.mockResolvedValue({
      type: 'navigate', screen: { id: 'inventory', label: 'Inventory' },
    });
    renderAt();
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'take me to inventory');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));

    // The point of the feature: the app moved.
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/noc/inventory'));
    expect(await within(panel).findByText(/opened/i)).toBeInTheDocument();

    const link = await within(panel).findByRole('link', { name: /go to inventory/i });
    expect(link).toHaveAttribute('href', '/noc/inventory');
    // Not wrapped in a <Button asChild>. This project's Button is a
    // plain <button> (Base UI, not Radix — no asChild), so wrapping
    // put an <a> inside a <button>: invalid HTML, and two focusable
    // things in one control for anyone on a keyboard.
    expect(link.closest('button')).toBeNull();
  });

  it('stays open on a computer, where it sits beside the page', async () => {
    setViewport(true);
    api.askAssistant.mockResolvedValue({
      type: 'navigate', screen: { id: 'inventory', label: 'Inventory' },
    });
    renderAt();
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'take me to inventory');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/noc/inventory'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on a phone, where it would cover the page it just opened', async () => {
    setViewport(false);
    api.askAssistant.mockResolvedValue({
      type: 'navigate', screen: { id: 'inventory', label: 'Inventory' },
    });
    renderAt();
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'take me to inventory');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/noc/inventory'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  // A screen id this build has no route for must not navigate, and
  // must not render a dead link either. The sentence still answers.
  it('does not move anywhere for a screen it cannot resolve', async () => {
    setViewport(true);
    api.askAssistant.mockResolvedValue({
      type: 'navigate', screen: { id: 'payroll', label: 'Payroll' },
    });
    renderAt();
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'take me to payroll');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));

    expect(await within(panel).findByText(/Payroll/)).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/noc/procurement');
    expect(within(panel).queryByRole('link')).toBeNull();
  });

  it('renders a clarifying question as tappable options that re-ask', async () => {
    api.askAssistant.mockResolvedValueOnce({
      type: 'clarify', question: 'Which one?', options: ['Receiving', 'Dispatch'],
    });
    renderAt();
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'how do I do it');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));

    await userEvent.click(await within(panel).findByRole('button', { name: 'Receiving' }));
    await waitFor(() => expect(api.askAssistant).toHaveBeenLastCalledWith('Receiving', 'receiving'));
  });

  it('says it does not know, and says who will', async () => {
    api.askAssistant.mockResolvedValue({ type: 'not_covered', closest: null });
    renderAt();
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'what is the weather');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));

    // "I don't know" on its own leaves someone exactly as stuck.
    expect(await within(panel).findByText(/manager will know/i)).toBeInTheDocument();
  });
});

describe('not spending a model call when the catalog already knows', () => {
  it('opens a suggestion chip straight from the catalog', async () => {
    renderAt('/noc/procurement');
    const panel = await openPanel();
    await userEvent.click(await within(panel).findByRole('button', { name: 'Recording a delivery' }));

    await waitFor(() => expect(api.fetchTopic).toHaveBeenCalledWith('receiving-record'));
    expect(api.askAssistant).not.toHaveBeenCalled();
  });

  it('opens a related link the same way', async () => {
    renderAt();
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'how do I receive');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));

    await userEvent.click(await within(panel).findByRole('button', { name: /count does not match/i }));
    await waitFor(() => expect(api.fetchTopic).toHaveBeenCalledWith('receiving-discrepancy'));
    expect(api.askAssistant).toHaveBeenCalledTimes(1);
  });
});

describe('when it cannot answer', () => {
  it('shows the server’s own wording, which says whether waiting helps', async () => {
    const err = new Error('The assistant is busy right now — try again in a minute.');
    err.status = 503;
    api.askAssistant.mockRejectedValue(err);

    renderAt();
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'anything at all');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));

    expect(await within(panel).findByText(/busy right now/i)).toBeInTheDocument();
  });

  it('does not blame the signal for a server refusal', async () => {
    const err = new Error('Could not reach the server.');
    err.isNetworkError = true;
    api.askAssistant.mockRejectedValue(err);

    renderAt();
    const panel = await openPanel();
    await userEvent.type(within(panel).getByRole('textbox', { name: /ask/i }), 'anything at all');
    await userEvent.click(within(panel).getByRole('button', { name: /send/i }));

    expect(await within(panel).findByText(/cannot reach the server/i)).toBeInTheDocument();
  });

  it('still takes questions when the catalog fails to load', async () => {
    api.fetchAssistantCatalog.mockRejectedValue(new Error('nope'));
    renderAt();
    const panel = await openPanel();
    // No chips, but the box works — the panel degrades rather than
    // breaking.
    expect(within(panel).getByRole('textbox', { name: /ask/i })).toBeEnabled();
  });
});

describe('accessibility', () => {
  it('names the panel and announces answers politely', async () => {
    renderAt();
    const panel = await openPanel();
    expect(panel).toHaveAccessibleName('Help');
    // polite, not assertive: an answer is not an emergency.
    expect(panel.querySelector('[aria-live="polite"]')).toBeTruthy();
  });

  // The launcher keeps one name and reports its state, rather than
  // renaming itself to "Close help" — which is already the name of
  // the button inside the panel.
  it('says whether it is open, rather than renaming itself', async () => {
    renderAt();
    const button = screen.getByRole('button', { name: 'Help' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getAllByRole('button', { name: /close help/i })).toHaveLength(1);
  });
});
