import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Section18AFormPage from '../pages/Section18AFormPage';
import { getSection18AForm, submitSection18AForm } from '../services/donationAPI';

vi.mock('../services/donationAPI', () => ({
  getSection18AForm: vi.fn(),
  submitSection18AForm: vi.fn(),
}));

const renderPage = () => render(
  <MemoryRouter initialEntries={['/section-18a/token-1']}>
    <Routes>
      <Route path="/section-18a/:token" element={<Section18AFormPage />} />
    </Routes>
  </MemoryRouter>
);

describe('Section18AFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSection18AForm.mockResolvedValue({ donationId: 42, donorName: 'Donor', donorEmail: 'donor@example.org' });
    submitSection18AForm.mockResolvedValue({ status: 'GENERATED', certificate: { certificate_number: '18A-2026-000001' } });
  });

  it('validates required fields before submit', async () => {
    renderPage();
    expect(await screen.findByText('Section 18A Donor Details')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

    expect(await screen.findAllByText('Required')).not.toHaveLength(0);
    expect(submitSection18AForm).not.toHaveBeenCalled();
  });

  it('validates donor identity fields for the selected donor type', async () => {
    renderPage();
    expect(await screen.findByDisplayValue('Donor')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Donor Type/i), { target: { value: 'natural_person' } });
    fireEvent.change(screen.getByLabelText(/Identification Type/i), { target: { value: 'sa_id' } });
    fireEvent.change(screen.getByLabelText(/South African ID number/i), { target: { value: '9001015009087' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
    expect(await screen.findByText('Enter a valid 13-digit South African ID number.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Donor Type/i), { target: { value: 'company' } });
    fireEvent.change(screen.getByLabelText(/Company registration number/i), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
    expect(await screen.findByText('Enter a valid company registration number, e.g. 2018/105664/07.')).toBeInTheDocument();
  });

  it('submits donor details and shows generated confirmation', async () => {
    renderPage();
    expect(await screen.findByDisplayValue('Donor')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Donor Type/i), { target: { value: 'natural_person' } });
    fireEvent.change(screen.getByLabelText(/Identification Type/i), { target: { value: 'sa_id' } });
    fireEvent.change(screen.getByLabelText(/South African ID number/i), { target: { value: '9001015009086' } });
    fireEvent.change(screen.getByLabelText(/Income Tax Number/i), { target: { value: '1234567890' } });
    fireEvent.change(screen.getByLabelText(/Phone/i), { target: { value: '0210000000' } });
    fireEvent.change(screen.getByLabelText(/Physical Address/i), { target: { value: '1 Main Road' } });
    fireEvent.change(screen.getByLabelText(/Postal Address/i), { target: { value: 'PO Box 1' } });
    fireEvent.click(screen.getByLabelText(/I declare/i));
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

    await waitFor(() => {
      expect(submitSection18AForm).toHaveBeenCalledWith('token-1', expect.objectContaining({
        donorType: 'natural_person',
        identificationType: 'sa_id',
        idNumber: '9001015009086',
        incomeTaxNumber: '1234567890',
      }));
    });
    expect(await screen.findByText(/certificate has been generated/i)).toBeInTheDocument();
  });
});
