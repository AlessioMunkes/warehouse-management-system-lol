import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getSection18AForm, submitSection18AForm } from '@/services/donationAPI';

const EMPTY_FORM = {
  donorType: '',
  identificationType: '',
  fullNameOrCompanyName: '',
  idNumber: '',
  passportNumber: '',
  passportCountry: '',
  registrationNumber: '',
  incomeTaxNumber: '',
  email: '',
  phone: '',
  physicalAddress: '',
  postalAddress: '',
  declarationAccepted: false,
};

export default function Section18AFormPage() {
  const { token } = useParams();
  const [metadata, setMetadata] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let cancelled = false;
    getSection18AForm(token)
      .then((data) => {
        if (cancelled) return;
        setMetadata(data);
        setForm((current) => ({
          ...current,
          fullNameOrCompanyName: data.donorName || '',
          email: data.donorEmail || '',
        }));
      })
      .catch((error) => {
        if (!cancelled) setFeedback(error.message || 'Could not load this form.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      delete next.idOrRegistration;
      return next;
    });
  };

  const isValidSaId = (value) => {
    if (!/^\d{13}$/.test(value)) return false;
    const year = Number(value.slice(0, 2));
    const month = Number(value.slice(2, 4));
    const day = Number(value.slice(4, 6));
    const currentYear = new Date().getFullYear() % 100;
    const century = year <= currentYear ? 2000 : 1900;
    const dob = new Date(century + year, month - 1, day);
    if (dob.getFullYear() !== century + year || dob.getMonth() !== month - 1 || dob.getDate() !== day) return false;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      let digit = Number(value[i]);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return (10 - (sum % 10)) % 10 === Number(value[12]);
  };

  const validate = () => {
    const next = {};
    ['donorType', 'fullNameOrCompanyName', 'incomeTaxNumber', 'email', 'phone', 'physicalAddress', 'postalAddress'].forEach((field) => {
      if (!String(form[field] || '').trim()) next[field] = 'Required';
    });
    if (form.donorType === 'natural_person') {
      if (!form.identificationType) next.identificationType = 'Required';
      if (form.identificationType === 'sa_id' && !isValidSaId(form.idNumber.trim())) {
        next.idNumber = 'Enter a valid 13-digit South African ID number.';
      }
      if (form.identificationType === 'passport') {
        if (!form.passportNumber.trim()) next.passportNumber = "Please enter the donor's passport number.";
        if (!form.passportCountry.trim()) next.passportCountry = "Please select the passport's country of issue.";
      }
    }
    if (form.donorType === 'company' && !/^\d{4}\/\d{6}\/\d{2}$/.test(form.registrationNumber.trim())) {
      next.registrationNumber = 'Enter a valid company registration number, e.g. 2018/105664/07.';
    }
    if (form.donorType === 'trust' && !/^(IT|MT)\s*\d{1,6}\/\d{4}\s*(\([A-Z]\))?$/i.test(form.registrationNumber.trim())) {
      next.registrationNumber = 'Enter a valid trust registration number, e.g. IT 000015/2023 (G).';
    }
    if (!form.declarationAccepted) next.declarationAccepted = 'Required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setFeedback('');
    try {
      const payload = {
        ...form,
        idNumber: form.donorType === 'natural_person' && form.identificationType === 'passport'
          ? form.passportNumber
          : form.idNumber,
      };
      const result = await submitSection18AForm(token, payload);
      setMetadata((current) => ({ ...current, completed: true, status: result.status, certificate: result.certificate }));
      setFeedback('Your Section 18A certificate has been generated and emailed.');
    } catch (error) {
      setErrors(error.errors || {});
      setFeedback(error.message || 'Could not submit this form.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <main className="min-h-screen bg-[#f8f5f2] px-4 py-8 text-[#2b3336]">
      <Card className="mx-auto max-w-3xl rounded-[12px] border border-[#e9e3dd]">
        <CardHeader>
          <CardTitle>Section 18A Donor Details</CardTitle>
        </CardHeader>
        <CardContent>
          {metadata?.completed ? (
            <div className="rounded-[8px] border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              <CheckCircle className="mb-2" />
              {feedback || 'This Section 18A certificate has already been generated.'}
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={submit}>
              <Field label="Donor Type" error={errors.donorType}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3"
                  value={form.donorType}
                  onChange={(e) => update('donorType', e.target.value)}
                >
                  <option value="">Select donor type</option>
                  <option value="natural_person">Natural person</option>
                  <option value="company">Company / juristic person</option>
                  <option value="trust">Trust</option>
                </select>
              </Field>
              <Field label="Full Name / Company Name" error={errors.fullNameOrCompanyName}><Input value={form.fullNameOrCompanyName} onChange={(e) => update('fullNameOrCompanyName', e.target.value)} /></Field>
              {form.donorType === 'natural_person' ? (
                <>
                  <Field label="Identification Type" error={errors.identificationType}>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3"
                      value={form.identificationType}
                      onChange={(e) => update('identificationType', e.target.value)}
                    >
                      <option value="">Select identification type</option>
                      <option value="sa_id">South African ID</option>
                      <option value="passport">Passport</option>
                    </select>
                  </Field>
                  {form.identificationType === 'sa_id' ? (
                    <Field label="South African ID number" error={errors.idNumber}>
                      <Input value={form.idNumber} onChange={(e) => update('idNumber', e.target.value)} />
                    </Field>
                  ) : null}
                  {form.identificationType === 'passport' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Passport number" error={errors.passportNumber}>
                        <Input value={form.passportNumber} onChange={(e) => update('passportNumber', e.target.value)} />
                      </Field>
                      <Field label="Country of issue" error={errors.passportCountry}>
                        <Input value={form.passportCountry} onChange={(e) => update('passportCountry', e.target.value)} />
                      </Field>
                    </div>
                  ) : null}
                </>
              ) : null}
              {form.donorType === 'company' ? (
                <Field label="Company registration number" error={errors.registrationNumber}>
                  <Input placeholder="2018/105664/07" value={form.registrationNumber} onChange={(e) => update('registrationNumber', e.target.value)} />
                </Field>
              ) : null}
              {form.donorType === 'trust' ? (
                <Field label="Trust registration number" error={errors.registrationNumber}>
                  <Input placeholder="IT 000015/2023 (G)" value={form.registrationNumber} onChange={(e) => update('registrationNumber', e.target.value)} />
                </Field>
              ) : null}
              <Field label="Income Tax Number" error={errors.incomeTaxNumber}><Input value={form.incomeTaxNumber} onChange={(e) => update('incomeTaxNumber', e.target.value)} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" error={errors.email}><Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></Field>
                <Field label="Phone" error={errors.phone}><Input value={form.phone} onChange={(e) => update('phone', e.target.value)} /></Field>
              </div>
              <Field label="Physical Address" error={errors.physicalAddress}><Textarea value={form.physicalAddress} onChange={(e) => update('physicalAddress', e.target.value)} /></Field>
              <Field label="Postal Address" error={errors.postalAddress}><Textarea value={form.postalAddress} onChange={(e) => update('postalAddress', e.target.value)} /></Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={form.declarationAccepted} onChange={(e) => update('declarationAccepted', e.target.checked)} />
                <span>I declare that these Section 18A details are correct.</span>
              </label>
              {errors.declarationAccepted ? <p className="text-sm text-red-600">{errors.declarationAccepted}</p> : null}
              {feedback ? <p className="text-sm text-red-600">{feedback}</p> : null}
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null} Submit</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Field({ label, error, children }) {
  return (
    <Label className="grid gap-1 text-sm font-medium">
      {label}
      {children}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </Label>
  );
}
