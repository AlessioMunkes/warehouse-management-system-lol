// ─────────────────────────────────────────────────────────────
// src/features/decanting/DecantingParts.jsx
//
// Pieces of the decanting screen that only show what they are given:
// a numbered panel, and one bag plan as instructions. The state and the
// saving stay in DecantingFlow.jsx.
// ─────────────────────────────────────────────────────────────
import { Actions, Button, Notice } from '../staff/StepPrimitives';
import { bagPhrase, grams, leftoverSentence, partialBagText, readableKg } from './decantingText';

// ── Panel ──────────────────────────────────────────────────────
// One part of the job. In Guided the head is a button and only one is
// open; in Form they are all open and the head is a plain label, so
// there is no control that looks tappable and does nothing.
export function Panel({ n, title, summary, open, done, locked, onOpen, children }) {
  const clickable = Boolean(onOpen) && !locked;
  const Head = clickable ? 'button' : 'div';

  return (
    <section
      className={[
        'stf-panel',
        open ? 'is-open' : '',
        done && !open ? 'is-done' : '',
        locked ? 'is-locked' : '',
      ].filter(Boolean).join(' ')}
    >
      <Head
        className="stf-panel-head"
        {...(clickable ? { type: 'button', onClick: onOpen, 'aria-expanded': open } : {})}
      >
        <span className="stf-panel-n" aria-hidden="true">{n}</span>
        <span className="stf-panel-text">
          <span className="stf-panel-title">{title}</span>
          {/* The summary is what makes a closed panel worth having:
              closed and blank is just a hidden field. */}
          {!open && summary ? <span className="stf-panel-sum">{summary}</span> : null}
        </span>
      </Head>
      {open ? <div className="stf-panel-body">{children}</div> : null}
    </section>
  );
}

// One bag plan as instructions: how many of each size, what that packs,
// and what it leaves. onUseRecommended, when given, offers a button to
// switch to this plan.
export function PlanResult({ title, line, labels, onUseRecommended = null }) {
  if (!line) return null;
  const shortfallKg = Number(line.shortfallKg || 0);
  const surplusKg = Number(line.surplusKg || 0);

  return (
    <>
      <p className="stf-field-label">{title}</p>
      {labels.map((label) => (
        <div key={`${title}-${label}`} className="stf-instruction">
          <span className="stf-instruction-n">{line.bags[label]}</span>
          <span className="stf-instruction-l">{bagPhrase(label, line.bags[label])}</span>
        </div>
      ))}

      {line.partialBag ? (
        <div className="stf-instruction">
          <span className="stf-instruction-n">1</span>
          <span className="stf-instruction-l">Partial 500g bag</span>
          <span className="stf-field-hint">{partialBagText(line.partialBag)}</span>
        </div>
      ) : null}

      <p className="stf-field-hint">Packed: {readableKg(line.packedKg)}</p>
      <p className="stf-field-hint">{leftoverSentence(line)}</p>

      {shortfallKg > 0 ? (
        <Notice tone="warn">
          {readableKg(shortfallKg)} still needs to be packed. Choose another bag size if you want
          to cover the remaining amount.
        </Notice>
      ) : null}

      {!shortfallKg && surplusKg >= 0.5 ? (
        <Notice tone="warn">
          {grams(surplusKg)} cannot be packed using the selected bag sizes. Choose another
          bag size or review the remaining amount.
        </Notice>
      ) : null}

      {line.isBulkLimited ? (
        <Notice tone="warn">
          This bulk amount does not cover everything the centres need this week. Pack what is here
          and tell your manager, so they can order more.
        </Notice>
      ) : null}

      {onUseRecommended ? (
        <Actions>
          <Button onClick={onUseRecommended}>Use recommended plan</Button>
        </Actions>
      ) : null}
    </>
  );
}
