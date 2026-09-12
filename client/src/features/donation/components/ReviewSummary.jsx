// ─────────────────────────────────────────────────────────────
// features/donation/components/ReviewSummary.jsx
//
// Three exports from this one file: ReviewSummary (read-only
// display), SectionPicker (worker picks which sections are wrong),
// EditSectionDialog (renders just the picked sections for correction).
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

import { CategorySelector } from "./CategorySelector";
import { DonationItemsList } from "./DonationItemsList";
import { ValueProgrammeFields } from "./ValueProgrammeFields";
import { DonorConsentSection, DonorInfoFields } from "./DonationSection";
import { NotesField } from "./NotesField";

const CATEGORY_LABELS = {
  recipe_food: "Recipe food",
  add_on_food: "Add-on food",
  non_recipe_food: "Non-recipe food",
  non_food: "Non-food",
  manager_review: "Manager Review",
};

const SECTION_LABELS = {
  category: "Category",
  items: "Items",
  value: "Value & Programme",
  donor: "Donor Details",
  notes: "Notes",
};
const SECTIONS = Object.keys(SECTION_LABELS);

// ── ReviewSummary — your existing component, unchanged ─────────
export function ReviewSummary({ draft }) {
  return (
    <div className="stf-step-body">
      <div className="stf-list">
        <div className="stf-row is-static">
          <div className="stf-row-main">
            <span className="stf-row-title">Category</span>
            <span className="stf-row-meta">
              {CATEGORY_LABELS[draft.category] || "Not selected"}
            </span>
          </div>
        </div>
      </div>

      <div className="stf-field-label">Items</div>
      <div className="stf-list">
        {draft.items.map((item) => (
          <div key={item.id} className="stf-row is-static">
            <div className="stf-row-main">
              <span className="stf-row-title">{item.description || "Untitled item"}</span>
              <span className="stf-row-meta">{item.quantity} {item.unit}</span>
            </div>
            <span className={`stf-badge ${item.productId ? "is-active" : "is-warn"}`}>
              {item.productId ? `Matched: ${item.productLabel}` : "Unmatched"}
            </span>
          </div>
        ))}
      </div>

      <div className="stf-list">
        <div className="stf-row is-static">
          <div className="stf-row-main">
            <span className="stf-row-title">Value & Programme</span>
            <span className="stf-row-meta">
              R{draft.estimatedValueZar || "0"} · {draft.programmeCode || "No programme"}
            </span>
          </div>
        </div>

        <div className="stf-row is-static">
          <div className="stf-row-main">
            <span className="stf-row-title">Donor Details</span>
            <span className="stf-row-meta">
              {draft.donorConsentGiven
                ? [
                  draft.donorName || "—",
                  draft.donorType ? draft.donorType.replace("_", " ") : "Type not selected",
                  draft.donorContactNumber || "No contact number",
                  draft.donorContact || "No email",
                ].join(" · ")
                : "No consent given"}
            </span>
          </div>
        </div>

        {draft.donorConsentGiven && (
          <div className="stf-row is-static">
            <div className="stf-row-main">
              <span className="stf-row-title">Section 18A donor details</span>
              <span className="stf-row-meta">
                {draft.donorAddress || "No address"} · Tax ref: {draft.donorTaxReference || "—"} ·{" "}
                {draft.donorIdNumber || "No identification or registration number"}
              </span>
            </div>
          </div>
        )}

        <div className="stf-row is-static">
          <div className="stf-row-main">
            <span className="stf-row-title">Notes</span>
            <span className="stf-row-meta">{draft.notes || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SectionPicker — NEW, added to this file ─────────────────────
export function SectionPicker({ open, onOpenChange, onContinue }) {
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    if (!open) setPicked([]);
  }, [open]);

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

  useEffect(() => {
    if (open) setLocalDraft(draft);
  }, [draft, open]);

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
          {sections.includes("category") && (
            <CategorySelector
              value={localDraft.category}
              onChange={(v) => updateLocalDraft({ category: v })}
            />
          )}
          {sections.includes("items") && (
            <DonationItemsList
              items={localDraft.items}
              onChange={(items) => updateLocalDraft({ items })}
            />
          )}
          {sections.includes("value") && (
            <ValueProgrammeFields
              estimatedValueZar={localDraft.estimatedValueZar}
              programmeCode={localDraft.programmeCode}
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
                  donorContactNumber={localDraft.donorContactNumber}
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
