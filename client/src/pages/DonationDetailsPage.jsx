// ─────────────────────────────────────────────────────────────
// src/pages/DonationDetailsPage.jsx
// Route: /donations/new
//
// Page 1 of 2. Step indicator restored — this page still leads to a
// separate Review page (step 2). Category selector removed (search-
// driven item classification instead, handled inside
// DonationItemsList). Donor fields conditionally rendered based on
// consent, not just disabled.
//
// Wrapped in the real StaffShell component, not a hand-rolled
// .stf-shell div: this page used to build its own bare markup, which
// has no app bar, no drawer, and — the actual bug report — no bottom
// tab bar (StaffTabBar lives inside StaffShell). Donation Intake has
// no separate manager view (see routes/paths.js's DONATION_INTAKE_ROLES
// comment — worker, manager and admin all use this same form), so
// unlike FeedTheSoilPage/DecantingPage there's no role branch here:
// StaffShell applies unconditionally.
// ─────────────────────────────────────────────────────────────
import { useNavigate, useLocation } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import StaffShell from "../components/layout/StaffShell";

import { useDonationDraft, validateDonationDraft } from "../features/donation/context/DonationDraftContext";
import { DONATIONS } from "../routes/paths";
import { DonationRail } from "../features/donation/components/DonationRail";
import { DonationItemsList } from "../features/donation/components/DonationItemsList";

export function DonationDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { draft, updateDraft, resetDraft } = useDonationDraft();
  const [errors, setErrors] = useState(location.state?.donationValidation?.errors || {});
  const [itemErrors, setItemErrors] = useState(location.state?.donationValidation?.itemErrors || {});
  const itemsRef = useRef(null);

  const focusFirstInvalidField = (nextErrors, nextItemErrors) => {
    window.setTimeout(() => {
      if (Object.keys(nextItemErrors || {}).length && itemsRef.current?.validate) {
        itemsRef.current.validate();
        return;
      }
      const fieldByError = {
        value: '#estimated-value-zar',
        estimatedValueZar: '#estimated-value-zar',
        isFood: '[name="is-food"]',
        donorName: '#donor-name',
        donorContact: '#donor-email',
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
  const validationMessages = [
    ...Object.values(errors || {}),
    ...Object.values(itemErrors || {}).flatMap((row) => Object.values(row || {})),
  ].filter(Boolean);

  return (
    <StaffShell crumb="Donations / Record a Donation" meta={today}>
      <DonationRail currentStep={0} />

      <section className="stf-step donation-intake-card">
        <div className="stf-step-head">
          <h1 className="stf-step-title">Record a Donation</h1>
          <p className="stf-step-sub">Capture donor basics, value and donated items.</p>
        </div>

        {validationMessages.length > 0 && (
          <div className="stf-notice is-warn" role="alert">
            <span className="stf-notice-mark" aria-hidden="true">!</span>
            <div className="stf-notice-body">
              <strong>Fix these before continuing:</strong>
              <ul className="donation-intake-error-list">
                {[...new Set(validationMessages)].map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="donation-intake-grid">
          <div className="stf-field">
            <label htmlFor="donor-name" className="stf-field-label">Donor Name</label>
            <input id="donor-name" className="stf-input is-text" value={draft.donorName} onChange={(e) => updateDraft({ donorName: e.target.value })} />
            <span className="stf-field-hint">Leave blank for an anonymous donation.</span>
          </div>
          <div className="stf-field">
            <label htmlFor="donor-email" className="stf-field-label">Donor Email</label>
            <input id="donor-email" type="email" className={`stf-input is-text ${errors.donorContact ? "is-flagged" : ""}`} value={draft.donorContact} onChange={(e) => updateDraft({ donorContact: e.target.value, contactDetails: e.target.value, contactMethod: e.target.value ? "email" : "" })} aria-invalid={Boolean(errors.donorContact)} />
            <span className="stf-field-hint">Required if Section 18A is requested. Leave blank for anonymous donations.</span>
            {errors.donorContact && <span className="stf-field-hint donation-intake-error">{errors.donorContact}</span>}
          </div>
          <fieldset className="stf-field donation-intake-choice" aria-label="Section 18A">
            <legend className="stf-field-label">Section 18A?</legend>
            <div className="donation-intake-options">
              <label className={`donation-intake-option ${draft.donorConsentGiven === true ? "is-chosen" : ""}`}>
                <input name="section-18a" type="radio" checked={draft.donorConsentGiven === true} onChange={() => updateDraft({ donorConsentGiven: true })} />
                Yes
              </label>
              <label className={`donation-intake-option ${draft.donorConsentGiven === false ? "is-chosen" : ""}`}>
                <input name="section-18a" type="radio" checked={draft.donorConsentGiven === false} onChange={() => updateDraft({ donorConsentGiven: false, estimatedValueZar: "" })} />
                No
              </label>
            </div>
            {errors.donorConsentGiven && <span className="stf-field-hint donation-intake-error">{errors.donorConsentGiven}</span>}
          </fieldset>
          {/* The value is only needed for a Section 18A certificate, and
              is only validated then (DonationDraftContext). */}
          {draft.donorConsentGiven === true && (
            <div className="stf-field">
              <label htmlFor="estimated-value-zar" className="stf-field-label">Estimated Donation Value</label>
              <input id="estimated-value-zar" className={`stf-input ${errors.value ? "is-flagged" : ""}`} type="number" min="0" value={draft.estimatedValueZar} onChange={(e) => updateDraft({ estimatedValueZar: e.target.value })} aria-invalid={Boolean(errors.value)} />
              {errors.value && <span className="stf-field-hint donation-intake-error">{errors.value}</span>}
            </div>
          )}
          <fieldset className="stf-field donation-intake-choice" aria-label="Food donation">
            <legend className="stf-field-label">Food?</legend>
            <div className="donation-intake-options">
              <label className={`donation-intake-option ${draft.isFood === true ? "is-chosen" : ""}`}>
                <input name="is-food" type="radio" checked={draft.isFood === true} onChange={() => updateDraft({ isFood: true })} /> 
                Yes
              </label>
              <label className={`donation-intake-option ${draft.isFood === false ? "is-chosen" : ""}`}>
                <input name="is-food" type="radio" checked={draft.isFood === false} onChange={() => updateDraft({ isFood: false })} /> 
                No
              </label>
            </div>
            {errors.isFood && <span className="stf-field-hint donation-intake-error">{errors.isFood}</span>}
          </fieldset>
        </div>

        <div className="donation-intake-items">
          <DonationItemsList
            ref={itemsRef}
            items={draft.items}
            isFood={draft.isFood}
            onChange={(items) => updateDraft({ items })}
            itemErrors={itemErrors}
          />
        </div>

        <div className="stf-actions is-row donation-intake-actions">
          <button type="button" className="stf-btn stf-btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="stf-btn stf-btn-primary" onClick={handleNext}>
            Next
          </button>
        </div>
      </section>
    </StaffShell>
  );
}
