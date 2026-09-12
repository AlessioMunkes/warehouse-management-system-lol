// ─────────────────────────────────────────────────────────────
// src/pages/ReviewPage.jsx
// Route: /donations/new/review
//
// Page 2 of 2. Shows everything captured on DonationDetailsPage,
// lets the worker correct specific sections via SectionPicker ->
// EditSectionDialog, then submits. On success, shows CompletionDialog.
//
// UPDATED: same .stf-crumb + rail-inside-.stf-main fix as
// DonationDetailsPage.jsx.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { useNavigate } from "react-router-dom";
//import { MobileBottomNav } from "@/components/layout/MoileBottomNav"; // pending teammate

import { useDonationDraft, validateDonationDraft } from "../features/donation/context/DonationDraftContext";
import { DONATIONS } from "../routes/paths";
import { DonationRail } from "../features/donation/components/DonationRail";
import { ReviewSummary, SectionPicker, EditSectionDialog } from "../features/donation/components/ReviewSummary";
import { CompletionDialog } from "../features/donation/components/WarningsNotice";
import { createPendingDonation } from "../services/donationAPI";

export function ReviewPage() {
  const navigate = useNavigate();
  const { draft, updateDraft, resetDraft } = useDonationDraft();

  // ── "No, fix something" flow ─────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editSections, setEditSections] = useState([]);
  const [editOpen, setEditOpen] = useState(false);

  // ── Submit flow ───────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionResult, setCompletionResult] = useState(null);

  const handlePickerContinue = (sections) => {
    setEditSections(sections);
    setEditOpen(true);
  };

  const handleSubmit = async () => {
    const validation = validateDonationDraft(draft);
    if (!validation.valid) {
      setSubmitError("Please fix the highlighted fields before submitting.");
      navigate(DONATIONS.new, { state: { donationValidation: validation } });
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Pending-donation endpoint: returns the created pending donation
      // with items[].status of 'resolved' or 'awaiting_resolution'.
      const result = await createPendingDonation(draft);
      const items = result?.items || [];
      setCompletionResult({
        pendingDonationId: result?.id ?? null,
        status: result?.status ?? null,
        resolvedCount: items.filter((it) => it.status === "resolved" || it.status === "committed").length,
        awaitingCount: items.filter((it) => it.status === "awaiting_resolution").length,
        awaitingItems: items.filter((it) => it.status === "awaiting_resolution"),
      });
      setCompletionOpen(true);
    } catch (err) {
      const backendValidation = mapBackendValidationErrors(err.errors || {}, draft);
      if (Object.keys(backendValidation.errors).length > 0 || Object.keys(backendValidation.itemErrors).length > 0) {
        setSubmitError(err.message || "Please fix the highlighted fields.");
        navigate(DONATIONS.new, {
          state: {
            donationValidation: {
              valid: false,
              errors: backendValidation.errors,
              itemErrors: backendValidation.itemErrors,
            },
          },
        });
      } else {
        setSubmitError(err.message || "Failed to record donation.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordAnother = () => {
    resetDraft();
    setCompletionOpen(false);
    navigate(DONATIONS.new);
  };

  const handleGoHome = () => {
    resetDraft();
    setCompletionOpen(false);
    navigate("/noc");
  };

  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="stf-shell">

      <div className="stf-crumb">
        <span>Donations / Review Donation</span>
        <span className="stf-crumb-meta">{today}</span>
      </div>

      <main className="stf-main">
        <DonationRail currentStep={1} />

        <div className="stf-step">
          <div className="stf-step-head">
            <h1 className="stf-step-title">Review Donation</h1>
            <p className="stf-step-sub">Does everything look okay?</p>
          </div>

          {submitError && (
            <div className="stf-notice is-warn">
              <span className="stf-notice-mark">!</span>
              <div className="stf-notice-body">{submitError}</div>
            </div>
          )}

          <ReviewSummary draft={draft} />

          <div className="stf-actions is-row">
            <button
              className="stf-btn stf-btn-secondary"
              onClick={() => navigate(DONATIONS.new)}
            >
              Back
            </button>
            <button
              className="stf-btn stf-btn-warn"
              onClick={() => setPickerOpen(true)}
            >
              No, fix something
            </button>
            <button
              className="stf-btn stf-btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Recording..." : "Yes, submit"}
            </button>
          </div>
        </div>
      </main>

      <SectionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onContinue={handlePickerContinue}
      />

      <EditSectionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        sections={editSections}
        draft={draft}
        updateDraft={updateDraft}
      />

      <CompletionDialog
        open={completionOpen}
        result={completionResult}
        onRecordAnother={handleRecordAnother}
        onGoHome={handleGoHome}
      />

      {/* <MobileBottomNav /> */}
    </div>
  );
}

const mapBackendValidationErrors = (errors, draft = {}) => {
  const fieldMap = {
    donationCategory: "category",
    category: "category",
    estimatedValueZar: "value",
    value: "value",
    donorConsentGiven: "donorConsentGiven",
    donorType: "donorType",
    donorName: "donorName",
    donorAddress: "donorAddress",
    donorContactNumber: "donorContactNumber",
    donorContact: "donorContact",
    donorEmail: "donorContact",
    donorTaxReference: "donorTaxReference",
    donorIdType: "donorIdType",
    donorIdCountry: "donorIdCountry",
    donorIdNumber: "donorIdNumber",
    notes: "notes",
  };
  const mapped = {};
  const itemErrors = {};

  Object.entries(errors || {}).forEach(([key, message]) => {
    const itemMatch = key.match(/^items\.(.+?)\.(description|quantity|unit)$/);
    if (itemMatch) {
      const [, itemRef, field] = itemMatch;
      const itemId = draft.items?.[Number(itemRef)]?.id || itemRef;
      itemErrors[itemId] = { ...(itemErrors[itemId] || {}), [field]: message };
      return;
    }
    mapped[fieldMap[key] || key] = message;
  });

  return { errors: mapped, itemErrors };
};
