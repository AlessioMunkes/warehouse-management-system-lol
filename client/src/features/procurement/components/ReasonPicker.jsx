// src/features/procurement/components/ReasonPicker.jsx
import React from 'react';

const PRESET_REASONS = ["Goods didn't match order", 'Damaged', 'Incomplete', 'Other'];

const ReasonPicker = ({ selectedReason, onSelectReason, details, onDetailsChange }) => (
  <div className="reason-picker">
    <label className="form-label">
      Reason <span className="form-required">*</span>
    </label>
    <div className="reason-picker-options">
      {PRESET_REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          className={`reason-pill ${selectedReason === reason ? 'reason-pill-active' : ''}`}
          onClick={() => onSelectReason(reason)}
          aria-pressed={selectedReason === reason}
        >
          {reason}
        </button>
      ))}
    </div>

    <div className="form-group" style={{ marginTop: 16 }}>
      <label className="form-label">Details (optional)</label>
      <textarea
        className="form-input reason-picker-textarea"
        placeholder="A short note for your manager"
        value={details}
        onChange={(e) => onDetailsChange(e.target.value)}
        rows={3}
      />
    </div>
  </div>
);

export default ReasonPicker;