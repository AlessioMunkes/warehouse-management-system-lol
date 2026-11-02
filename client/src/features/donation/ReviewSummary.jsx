// ─────────────────────────────────────────────────────────────
// features/donation/ReviewSummary.jsx
//
// Three exports from this one file: ReviewSummary (read-only
// display), SectionPicker (worker picks which sections are wrong),
// EditSectionDialog (renders just the picked sections for correction).
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";


import { DonationItemsList } from "./DonationItemsList";
import { ValueField } from "./ValueField";
import { DonorConsentSection, DonorInfoFields } from "./DonationSection";
import { NotesField } from "./NotesField";
import StatusBadge from '@/components/ui/status-badge';
import { workerStatus } from '../staff/workerStatus';

const SECTION_LABELS = {
  items: "Items",
  value: "Value",
  donor: "Donor Details",
  notes: "Notes",
};
const SECTIONS = Object.keys(SECTION_LABELS);

// ── ReviewSummary — your existing component, unchanged ─────────
export function ReviewSummary({ draft }) {
  return (
    <div className="stf-step-body">
      <div className="stf-field-label">Items</div>
      <div className="stf-list">
        {draft.items.map((item) => (
          <div key={item.id} className="stf-row is-static">
            <div className="stf-row-main">
              <span className="stf-row-title">{item.description || "Untitled item"}</span>
              <span className="stf-row-meta">{item.quantity} {item.unit}</span>
            </div>
            <StatusBadge {...workerStatus("match", item.productId ? "matched" : "unmatched")} className="max-w-[60%] truncate">
              {item.productId ? `Matched: ${item.productLabel}` : "Unmatched"}
            </StatusBadge>
          </div>
        ))}
      </div>

      <div className="stf-list">
        <div className="stf-row is-static">
          <div className="stf-row-main">
            <span className="stf-row-title">Value</span>
            <span className="stf-row-meta">
              {draft.estimatedValueZar === "" || draft.estimatedValueZar === null || draft.estimatedValueZar === undefined
                ? "Not given"
                : `R${draft.estimatedValueZar}${draft.valueEstimated ? " (estimated, a manager will verify it)" : ""}`}
            </span>
          </div>
        </div>

        <div className="stf-row is-static">
          <div className="stf-row-main">
            <span className="stf-row-title">Donor Details</span>
            <span className="stf-row-meta">
              {draft.donorConsentGiven
                ? [
                  draft.donorName || "-",
                  draft.donorContact || draft.contactDetails || "No email",
                  "Section 18A requested",
                ].join(" · ")
                : [
                  draft.donorName || "Anonymous donor",
                  draft.donorContact || draft.contactDetails || "No email",
                  "No Section 18A",
                ].join(" · ")}
            </span>
          </div>
        </div>

        {draft.__showLegacySection18AIntake === true && (
          <div className="stf-row is-static">
            <div className="stf-row-main">
              <span className="stf-row-title">Section 18A donor details</span>
              <span className="stf-row-meta">
                {draft.donorAddress || "No address"} · Tax ref: {draft.donorTaxReference || "-"} ·{" "}
                {draft.donorIdNumber || "No identification or registration number"}
              </span>
            </div>
          </div>
        )}

        <div className="stf-row is-static">
          <div className="stf-row-main">
            <span className="stf-row-title">Notes</span>
            <span className="stf-row-meta">{draft.notes || "-"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SectionPicker — NEW, added to this file ─────────────────────
export function SectionPicker({ open, onOpenChange, onContinue }) {
  const [picked, setPicked] = useState([]);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setPicked([]);
  }

  const toggle = (section) =>
    setPicked((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="stf-shell">
        <DialogHeader>
          <DialogTitle>Which sections need fixing?</DialogTitle>
        </DialogHeader>

        <div className="stf-choices">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`stf-choice ${picked.includes(s) ? "is-chosen" : ""}`}
              onClick={() => toggle(s)}
            >
              <span className="stf-choice-label">{SECTION_LABELS[s]}</span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <button className="stf-btn stf-btn-secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className="stf-btn stf-btn-primary"
            disabled={picked.length === 0}
            onClick={() => { onContinue(picked); onOpenChange(false); }}
          >
            Continue
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── EditSectionDialog — NEW, added to this file ─────────────────
export function EditSectionDialog({ open, onOpenChange, sections, draft, updateDraft }) {
  const [localDraft, setLocalDraft] = useState(draft);
  const [prevDraft, setPrevDraft] = useState(draft);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen || (open && draft !== prevDraft)) {
    setWasOpen(open);
    setPrevDraft(draft);
    if (open) setLocalDraft(draft);
  }

  const updateLocalDraft = (patch) => setLocalDraft((prev) => ({ ...prev, ...patch }));
  const closeWithoutSaving = () => {
    setLocalDraft(draft);
    onOpenChange(false);
  };
  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      closeWithoutSaving();
      return;
    }
    onOpenChange(true);
  };
  const handleCancel = () => closeWithoutSaving();
  const handleSave = () => {
    updateDraft(localDraft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="stf-shell" style={{ maxHeight: "80vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle>Fix: {sections.map((s) => SECTION_LABELS[s]).join(", ")}</DialogTitle>
        </DialogHeader>

        <div className="stf-step-body">
          {sections.includes("items") && (
            <DonationItemsList
              items={localDraft.items}
              onChange={(items) => updateLocalDraft({ items })}
            />
          )}
          {sections.includes("value") && (
            <ValueField
              estimatedValueZar={localDraft.estimatedValueZar}
              required={localDraft.donorConsentGiven === true}
              onChange={updateLocalDraft}
            />
          )}
          {sections.includes("donor") && (
            <>
              <DonorConsentSection
                consentGiven={localDraft.donorConsentGiven}
                onChange={(v) => updateLocalDraft({ donorConsentGiven: v })}
              />
              {localDraft.donorConsentGiven === true && (
                <DonorInfoFields
                  donorName={localDraft.donorName}
                  donorContact={localDraft.donorContact}
                  donorTaxReference={localDraft.donorTaxReference}
                  donorType={localDraft.donorType}
                  donorAddress={localDraft.donorAddress}
                  donorTradingName={localDraft.donorTradingName}
                  donorIdType={localDraft.donorIdType}
                  donorIdCountry={localDraft.donorIdCountry}
                  donorIdNumber={localDraft.donorIdNumber}
                  onChange={updateLocalDraft}
                />
              )}
            </>
          )}
          {sections.includes("notes") && (
            <NotesField notes={localDraft.notes} onChange={(notes) => updateLocalDraft({ notes })} />
          )}
        </div>

        <DialogFooter>
          <button className="stf-btn stf-btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="stf-btn stf-btn-primary" onClick={handleSave}>
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
