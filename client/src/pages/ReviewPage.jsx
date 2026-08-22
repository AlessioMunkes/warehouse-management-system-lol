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

import { TopNavbar } from "../features/taskdashboard/components/TopNavBar";
//import { MobileBottomNav } from "@/components/layout/MoileBottomNav"; // pending teammate

import { useDonationDraft } from "../features/donation/components/DonationDraftContext";
import { DonationRail } from "../features/donation/components/DonationRail";
import { ReviewSummary, SectionPicker, EditSectionDialog } from "../features/donation/components/ReviewSummary";
import { CompletionDialog } from "../features/donation/components/WarningsNotice";
import { createDonation } from "../services/donationAPI";

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
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createDonation(draft);
      setCompletionResult(result); // { donation, warnings, duplicate }
      setCompletionOpen(true);
    } catch (err) {
      setSubmitError(err.message || "Failed to record donation.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordAnother = () => {
    resetDraft();
    setCompletionOpen(false);
    navigate("/donations/new");
  };

  const handleGoHome = () => {
    resetDraft();
    setCompletionOpen(false);
    navigate("/");
  };

  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="stf-shell">
      <TopNavbar />

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
              onClick={() => navigate("/donations/new")}
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