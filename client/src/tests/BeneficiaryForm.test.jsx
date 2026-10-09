import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BeneficiaryForm from '../features/beneficiaries/BeneficiaryForm';

describe('BeneficiaryForm', () => {
  it('submits optional email and mobile contact fields with the beneficiary payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <BeneficiaryForm
        initial={{ name: 'Sunnyside ECD', cohort: 'week1', contactName: 'Jane Doe', childCount: '' }}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText('Email address'), 'ecd@example.org');
    await user.type(screen.getByLabelText('Mobile number'), '+27 82 123 4567');
    await user.click(screen.getByRole('button', { name: 'Add beneficiary' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      contactEmail: 'ecd@example.org',
      mobileNumber: '+27 82 123 4567',
      childCount: null,
    }));
  });

  it('keeps existing null email and mobile values editable', async () => {
    render(
      <BeneficiaryForm
        initial={{ name: 'Sunnyside ECD', cohort: 'week1', contactName: 'Jane Doe', contactEmail: null, mobileNumber: null, childCount: 40 }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Email address')).toHaveValue('');
    expect(screen.getByLabelText('Mobile number')).toHaveValue('');
    expect(screen.getByText('Used for collection reminder emails.')).toBeInTheDocument();
  });

  it('prefills existing contactEmail when editing', () => {
    render(
      <BeneficiaryForm
        initial={{ name: 'Sunnyside ECD', cohort: 'week1', contactName: 'Jane Doe', contactEmail: 'ecd@example.org', mobileNumber: '0821234567', childCount: 40 }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Email address')).toHaveValue('ecd@example.org');
  });
});
