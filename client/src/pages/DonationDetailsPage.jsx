// ─────────────────────────────────────────────────────────────
// src/pages/DonationDetailsPage.jsx
// Route: /donations/new
//
// Page 1 of 2. Category, Items, Value & Programme, Donor Consent/Info,
// Notes -> Next (goes to Review).
//
// UPDATED: .stf-crumb added under TopNavbar (matches Receiving's
// pattern). .stf-rail moved inside .stf-main, right above the step
// heading, instead of full-width between navbar and main — fixes the
// rail rendering as a stray bar stuck under the black navbar.
// ─────────────────────────────────────────────────────────────
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import { TopNavbar } from "../features/taskdashboard/components/TopNavBar";
//import { MobileBottomNav } from "@/components/layout/MoileBottomNav"; // pending teammate

import { useDonationDraft } from "../features/donation/context/DonationDraftContext";
import { DonationRail } from "../features/donation/components/DonationRail";
import { CategorySelector } from "../features/donation/components/CategorySelector";
import { DonationItemsList } from "../features/donation/components/DonationItemsList";
import { ValueProgrammeFields } from "../features/donation/components/ValueProgrammeFields";
import { DonorConsentSection, DonorInfoFields } from "../features/donation/components/DonationSection";
import { NotesField } from "../features/donation/components/NotesField";

export function DonationDetailsPage() {
  const navigate = useNavigate();
  const { draft, updateDraft } = useDonationDraft();
  const [errors, setErrors] = useState({});
  const [itemErrors, setItemErrors] = useState({});

  // Donor consent/info deliberately has no hard validation here —
  // "no consent" is a valid answer, not an incomplete field. Only
  // Category, Items, and Value block progression.
  const validate = () => {
    const next = {};
    if (!draft.category) next.category = "Select a category to continue.";

    if (draft.estimatedValueZar === "" || Number(draft.estimatedValueZar) < 0) {
      next.value = "An estimated value is required (enter 0 if none).";
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
    if (validate()) navigate("/donations/new/review");
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

          <CategorySelector
            value={draft.category}
            onChange={(v) => updateDraft({ category: v })}
            error={errors.category}
          />

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

          <DonorInfoFields
            donorName={draft.donorName}
            donorContact={draft.donorContact}
            donorTaxReference={draft.donorTaxReference}
            disabled={!draft.donorConsentGiven}
            onChange={updateDraft}
          />

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
