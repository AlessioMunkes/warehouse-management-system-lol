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
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import { TopNavbar } from "../features/taskdashboard/components/TopNavBar";
//import { MobileBottomNav } from "@/components/layout/MoileBottomNav"; // pending teammate

import { useDonationDraft } from "../features/donation/context/DonationDraftContext";
import { DONATIONS } from "../routes/paths";
import { DonationRail } from "../features/donation/components/DonationRail";
import { DonationItemsList } from "../features/donation/components/DonationItemsList";
import { ValueProgrammeFields } from "../features/donation/components/ValueProgrammeFields";
import { DonorConsentSection, DonorInfoFields } from "../features/donation/components/DonationSection";
import { NotesField } from "../features/donation/components/NotesField";

export function DonationDetailsPage() {
  const navigate = useNavigate();
  const { draft, updateDraft } = useDonationDraft();
  const [errors, setErrors] = useState({});
  const [itemErrors, setItemErrors] = useState({});

  // Category is no longer a field on this form (removed — see
  // CategorySelector removal note), so it's dropped from validation.
  // Donor consent/info still has no hard validation — "no consent" is
  // a valid answer, not an incomplete field.
  const validate = () => {
    const next = {};

    if (draft.estimatedValueZar === "" || Number(draft.estimatedValueZar) < 0) {
      next.value = "An estimated value is required (enter 0 if none).";
    }
    // Only validate donor email if consent was given AND something was
  // actually typed — an empty field shouldn't block submission (donor
  // email presumably isn't itself mandatory even when consent is yes,
  // just optional contact info — adjust if that's wrong).
  if (draft.donorConsentGiven === true && draft.donorContact.trim()) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(draft.donorContact.trim())) {
      next.donorContact = "Enter a valid email address.";
    }
  }

    const nextItemErrors = {};
    draft.items.forEach((item) => {
      const rowErrors = {};
      if (!item.description.trim()) rowErrors.description = "Description required.";
      if (!item.quantity || Number(item.quantity) <= 0) rowErrors.quantity = "Enter a quantity.";
      if (Object.keys(rowErrors).length) nextItemErrors[item.id] = rowErrors;
    });

    setErrors(next);
    setItemErrors(nextItemErrors);
    return Object.keys(next).length === 0 && Object.keys(nextItemErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) navigate(DONATIONS.review);
  };

  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="stf-shell">
      <TopNavbar />

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

          <DonationItemsList
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
          />

          {draft.donorConsentGiven === true && (
            <DonorInfoFields
              donorName={draft.donorName}
              donorContact={draft.donorContact}
              donorTaxReference={draft.donorTaxReference}
              onChange={updateDraft}
              error={errors.donorContact}
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
          />

          <div className="stf-actions is-row">
            <button className="stf-btn stf-btn-secondary" onClick={() => navigate("/")}>
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