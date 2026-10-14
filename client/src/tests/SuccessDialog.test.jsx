// ─────────────────────────────────────────────────────────────
// src/tests/SuccessDialog.test.jsx
//
// The one confirmation every floor flow ends on: what was done, a line
// about it, an optional second thing to do, and a way to carry on.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuccessDialog from '../features/staff/SuccessDialog';
import { OFFLINE_TITLE, offlineLine } from '../features/staff/successText';

describe('SuccessDialog', () => {
  it('says what was done, and closes on its main button', async () => {
    const onClose = vi.fn();
    render(<SuccessDialog open title="Delivery received" onClose={onClose}>Stock updated.</SuccessDialog>);

    expect(screen.getByRole('dialog', { name: 'Delivery received' })).toBeInTheDocument();
    expect(screen.getByText('Stock updated.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('offers a second thing to do when there is one', async () => {
    const view = vi.fn();
    render(
      <SuccessDialog open title="Pallet dispatched" onClose={() => {}} action={{ label: 'View dispatch note', onClick: view }}>
        Stock updated. The pallet can go.
      </SuccessDialog>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'View dispatch note' }));
    expect(view).toHaveBeenCalledOnce();
  });

  // Saved on the phone is not finished, so it must not look finished.
  it('does not use the green tick for work that is only on the phone', () => {
    render(
      <SuccessDialog open tone="offline" title={OFFLINE_TITLE} onClose={() => {}}>
        {offlineLine('Do not count it again.')}
      </SuccessDialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Saved on this phone' })).toBeInTheDocument();
    expect(screen.getByText(/No signal\. It sends itself when you are back in range\. Do not count it again\./)).toBeInTheDocument();
    expect(document.querySelector('.stf-success-mark')).toHaveClass('is-waiting');
  });

  // "Says more than just done": a picture of the job and what it came to.
  it('shows the job\'s picture and its numbers, flagging the one to look at', () => {
    render(
      <SuccessDialog
        open title="Pallet packed" picture="ti-package" onClose={() => {}}
        facts={[{ value: 12, label: 'items packed' }, null, { value: 1, label: 'item flagged', warn: true }]}
      >
        It is ready for dispatch to Green Pastures.
      </SuccessDialog>,
    );
    expect(document.querySelector('.stf-success-picture .ti-package')).toBeTruthy();
    expect(document.querySelectorAll('.stf-success-bit').length).toBe(8);
    expect(screen.getByText('items packed').nextSibling).toHaveTextContent('12');
    expect(screen.getByText('item flagged').closest('.stf-success-fact')).toHaveClass('is-warn');
  });

  it('does not celebrate work that is only on the phone', () => {
    render(<SuccessDialog open tone="offline" picture="ti-package" title={OFFLINE_TITLE} onClose={() => {}}>x</SuccessDialog>);
    expect(document.querySelector('.stf-success-bit')).toBeNull();
    expect(document.querySelector('.stf-success-picture')).toHaveClass('is-waiting');
  });

  it('shows nothing when closed', () => {
    render(<SuccessDialog open={false} title="Pallet packed" onClose={() => {}}>It is ready for dispatch.</SuccessDialog>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
