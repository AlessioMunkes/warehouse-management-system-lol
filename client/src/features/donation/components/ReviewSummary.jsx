// ─────────────────────────────────────────────────────────────
// features/donation/components/ReviewSummary.jsx
//
// Three exports from this one file: ReviewSummary (read-only
// display), SectionPicker (worker picks which sections are wrong),
// EditSectionDialog (renders just the picked sections for correction).
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
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
                ? `Consent given · ${draft.donorName || "—"} · ${draft.donorContact || "—"}`
                : "No consent given"}
            </span>
          </div>
        </div>

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="stf-shell" style={{ maxHeight: "80vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle>Fix: {sections.map((s) => SECTION_LABELS[s]).join(", ")}</DialogTitle>
        </DialogHeader>

        <div className="stf-step-body">
          {sections.includes("category") && (
            <CategorySelector
            
              value={draft.category}
              onChange={(v) => updateDraft({ category: v })}
            />
          )}
          {sections.includes("items") && (
            <DonationItemsList
              items={draft.items}
              onChange={(items) => updateDraft({ items })}
            />
          )}
          {sections.includes("value") && (
            <ValueProgrammeFields
              estimatedValueZar={draft.estimatedValueZar}
              programmeCode={draft.programmeCode}
              onChange={updateDraft}
            />
          )}
          {sections.includes("donor") && (
            <>
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
            </>
          )}
          {sections.includes("notes") && (
            <NotesField notes={draft.notes} onChange={(notes) => updateDraft({ notes })} />
          )}
        </div>

        <DialogFooter>
          <button className="stf-btn stf-btn-primary" onClick={() => onOpenChange(false)}>
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}