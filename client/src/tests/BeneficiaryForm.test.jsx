import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BeneficiaryForm from '../features/beneficiaries/components/BeneficiaryForm';

describe('BeneficiaryForm', () => {
  it('submits the optional mobile number with the beneficiary payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <BeneficiaryForm
        initial={{ name: 'Sunnyside ECD', cohort: 'week1', contactName: 'Jane Doe', childCount: '' }}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText('Mobile number'), '+27 82 123 4567');
    await user.click(screen.getByRole('button', { name: 'Add beneficiary' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      mobileNumber: '+27 82 123 4567',
      childCount: null,
    }));
  });

  it('keeps existing null mobile values editable', async () => {
    render(
      <BeneficiaryForm
        initial={{ name: 'Sunnyside ECD', cohort: 'week1', contactName: 'Jane Doe', mobileNumber: null, childCount: 40 }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Mobile number')).toHaveValue('');
  });
});
