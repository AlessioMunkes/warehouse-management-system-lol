// ─────────────────────────────────────────────────────────────
// src/pages/DonationDetailsPage.jsx
// Route: /donations/new
//
// Page 1 of 2. Step indicator restored — this page still leads to a
// separate Review page (step 2). Category selector removed (search-
// driven item classification instead, handled inside
// DonationItemsList). Donor fields conditionally rendered based on
// consent, not just disabled.
// ─────────────────────────────────────────────────────────────
import { useNavigate, useLocation } from "react-router-dom";
import { useRef, useState } from "react";
import { useEffect } from "react";
//import { MobileBottomNav } from "@/components/layout/MoileBottomNav"; // pending teammate

import { useDonationDraft, validateDonationDraft } from "../features/donation/context/DonationDraftContext";
import { DONATIONS } from "../routes/paths";
import { DonationRail } from "../features/donation/components/DonationRail";
import { CategorySelector } from "../features/donation/components/CategorySelector";
import { DonationItemsList } from "../features/donation/components/DonationItemsList";
import { ValueProgrammeFields } from "../features/donation/components/ValueProgrammeFields";
import { DonorConsentSection, DonorInfoFields } from "../features/donation/components/DonationSection";
import { NotesField } from "../features/donation/components/NotesField";

export function DonationDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { draft, updateDraft, resetDraft } = useDonationDraft();
  const [errors, setErrors] = useState(location.state?.donationValidation?.errors || {});
  const [itemErrors, setItemErrors] = useState(location.state?.donationValidation?.itemErrors || {});
  const itemsRef = useRef(null);

  const focusFirstInvalidField = (nextErrors, nextItemErrors) => {
    window.setTimeout(() => {
      if (nextErrors.category) {
        document.querySelector('[aria-label="Donation category"] [role="radio"]')?.focus();
        return;
      }
      if (Object.keys(nextItemErrors || {}).length && itemsRef.current?.validate) {
        itemsRef.current.validate();
        return;
      }
      const fieldByError = {
        value: '#estimated-value-zar',
        estimatedValueZar: '#estimated-value-zar',
        donorConsentGiven: '[aria-label="Donor consent"] [role="radio"]',
        donorType: '#donor-type',
        donorName: '#donor-name',
        donorAddress: '#donor-address',
        donorContactNumber: '#donor-contact-number',
        donorContact: '#donor-email',
        donorTaxReference: '#donor-tax-reference',
        donorIdType: '#donor-id-type',
        donorIdCountry: '#donor-id-country',
        donorIdNumber: '#donor-id-number',
        notes: '#donation-notes',
      };
      const firstKey = Object.keys(nextErrors || {})[0];
      const target = document.querySelector(fieldByError[firstKey] || '[aria-invalid="true"]');
      target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      target?.focus?.();
    }, 0);
  };

  const handleNext = () => {
    const { errors: nextErrors, itemErrors: nextItemErrors, valid } = validateDonationDraft(draft);
    setErrors(nextErrors);
    setItemErrors(nextItemErrors);
    if (!valid) {
      focusFirstInvalidField(nextErrors, nextItemErrors);
      return;
    }
    if (valid) navigate(DONATIONS.review);
  };

  const handleCancel = () => {
    resetDraft();
    navigate("/");
  };

  useEffect(() => {
    const validation = location.state?.donationValidation;
    if (validation && !validation.valid) {
      focusFirstInvalidField(validation.errors || {}, validation.itemErrors || {});
    }
  }, [location.state]);

  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="stf-shell">

      <div className="stf-crumb">
        <span>Donations / Record a Donation</span>
        <span className="stf-crumb-meta">{today}</span>
      </div>

      <main className="stf-main">
        <DonationRail currentStep={0} />

        <div className="stf-step">
          <div className="stf-step-head">
            <h1 className="stf-step-title">Record a Donation</h1>
          </div>

          <CategorySelector
            value={draft.category}
            onChange={(category) => updateDraft({ category })}
            error={errors.category}
          />

          <DonationItemsList
            ref={itemsRef}
            items={draft.items}
            onChange={(items) => updateDraft({ items })}
            itemErrors={itemErrors}
          />

          <ValueProgrammeFields
            estimatedValueZar={draft.estimatedValueZar}
            programmeCode={draft.programmeCode}
            onChange={updateDraft}
            error={errors.value}
          />

          <DonorConsentSection
            consentGiven={draft.donorConsentGiven}
            onChange={(v) => updateDraft({ donorConsentGiven: v })}
            error={errors.donorConsentGiven}
          />

          {draft.donorConsentGiven === true && (
            <DonorInfoFields
              donorName={draft.donorName}
              donorContact={draft.donorContact}
              donorTaxReference={draft.donorTaxReference}
              donorType={draft.donorType}
              donorAddress={draft.donorAddress}
              donorContactNumber={draft.donorContactNumber}
              donorTradingName={draft.donorTradingName}
              donorIdType={draft.donorIdType}
              donorIdCountry={draft.donorIdCountry}
              donorIdNumber={draft.donorIdNumber}
              onChange={updateDraft}
              errors={errors}
            />
          )}

          {draft.donorConsentGiven === false && (
            <p className="stf-hint">
              Donor details will not be recorded. This donation will not be
              eligible for a Section 18A tax certificate.
            </p>
          )}

          {draft.donorConsentGiven == null && (
            <p className="stf-hint">Select an option above to continue.</p>
          )}

          <NotesField
            notes={draft.notes}
            onChange={(notes) => updateDraft({ notes })}
            error={errors.notes}
          />

          <div className="stf-actions is-row">
            <button className="stf-btn stf-btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button className="stf-btn stf-btn-primary" onClick={handleNext}>
              Next
            </button>
          </div>
        </div>
      </main>

      {/* <MobileBottomNav /> */}
    </div>
  );
}
