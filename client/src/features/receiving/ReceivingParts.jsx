// ─────────────────────────────────────────────────────────────
// src/features/receiving/ReceivingParts.jsx
//
// Pieces of the receiving screen that only show what they are given:
// the "Sign it in" panel beside the lines, and the detail under one
// line (where it goes, the date on the box, short or over). The counts
// and the saving stay in ReceivingFlow.jsx.
// ─────────────────────────────────────────────────────────────
import PhotoButton from '../staff/PhotoButton';
import { ChoiceList, Notice, KeyValues } from '../staff/StepPrimitives';
import SignaturePad from './SignaturePad';
import { LOCATIONS } from './receivingText';

// Shared by both modes, right before the submit button. SignaturePad
// is the manager side's own component — canvasClassName /
// clearButtonClassName are what let it look native here instead of
// carrying the manager page's plain-link styling.
const SignatureField = ({ value, onChange }) => (
  <div className="stf-signature-field">
    <span className="stf-field-label">Driver&rsquo;s signature</span>
    <SignaturePad
      onChange={onChange}
      canvasClassName="stf-sign-canvas"
      clearButtonClassName="stf-signature-clear"
    />
    {!value ? (
      <p className="stf-field-hint">Ask the driver to sign above before you finish.</p>
    ) : null}
  </div>
);

// Beside the lines in both views: the date, a photo, the short-line
// warning and the driver's signature.
// When it arrived is not typed: the date and time are recorded when the
// delivery is finished, and shown here, read-only, until then.
const deliveredText = (at) => at.toLocaleString('en-ZA', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Africa/Johannesburg',
});

export function SignInPanel({ now, orderId, shortCount, signature, onSignature }) {
  return (
    <div className="stf-summary">
      <p className="stf-summary-title">Sign it in</p>
      <KeyValues pairs={[['Delivered', deliveredText(now)]]} />
      <p className="stf-field-hint">The date and time are recorded when you finish.</p>
      {/* A picture of the delivery as it arrived, kept against its
          order. Optional, and saved the moment it is taken. */}
      {orderId ? (
        <PhotoButton entityType="purchase_order" entityId={orderId} hintKey="photo.hintDelivery" />
      ) : null}
      {shortCount > 0 ? (
        <Notice tone="warn">
          {shortCount} {shortCount === 1 ? 'line is' : 'lines are'} short.
          Saving still records the delivery, and your manager gets the difference to
          follow up.
        </Notice>
      ) : null}
      <SignatureField value={signature} onChange={onSignature} />
    </div>
  );
}

// Under one line: what it is, where it is going, the date on the box,
// and a warning when the count is short or over.
export function LineDetail({ line, onPatch }) {
  const counted = line.counted;
  const short = counted !== '' && Number(counted) < line.expected;
  const over  = counted !== '' && Number(counted) > line.expected;
  return (
    <>
      <KeyValues
        pairs={[
          ['Code', line.sku],
          ['Ordered', `${line.ordered}${line.expectedKg ? ` (${line.expectedKg} kg)` : ''}`],
          line.alreadyReceived > 0 ? ['Already received', line.alreadyReceived] : null,
          line.alreadyReceived > 0 ? ['Still to come', line.expected] : null,
          ['Type', line.fresh ? 'Fresh, needs a use-by date' : 'Dry'],
        ]}
      />

      <ChoiceList
        legend={`Where the ${line.name} is going`}
        options={LOCATIONS}
        value={line.location}
        onChange={(value) => onPatch(line.purchaseOrderItemId, { location: value })}
      />

      {/* Every line, in both views. Fresh food must have
          one; tins and packets usually carry a best-before
          too, and that date is what the expiry warnings
          run on, so it is asked for and may be left
          empty. */}
      <div className="stf-field">
        <label
          className="stf-field-label"
          htmlFor={`stf-useby-${line.purchaseOrderItemId}`}
        >
          What is the date on the box?
        </label>
        <input
          id={`stf-useby-${line.purchaseOrderItemId}`}
          className="stf-input is-text"
          type="date"
          value={line.useBy}
          onChange={(e) => onPatch(line.purchaseOrderItemId, { useBy: e.target.value })}
        />
        <p className="stf-field-hint">
          {line.fresh
            ? 'Fresh food is packed by date, so this is what decides which box goes out first.'
            : 'Leave it empty if there is no date.'}
        </p>
      </div>

      {short ? (
        <Notice tone="warn">
          {line.expected - Number(counted)} fewer than the note says. Your manager
          will be told, and this delivery stays open until it is sorted out.
        </Notice>
      ) : null}
      {over ? (
        <Notice tone="warn">
          That is more than the note says. Count again, and if it is right your
          manager will check it against the order.
        </Notice>
      ) : null}
    </>
  );
}
