# Handover notes

Things that were looked at, decided against doing for now, or left open, with enough detail to pick them up again.

## Worker step-back (deferred)

### What this is

Step D added a "‹ back" inside the worker flows (Receiving, Decanting, Dispatch, Feed the Soil) so a worker could leave an item, pick another, and come back. It was built and then reverted (`d79ba9e`, reverted in `61af7be`) because looking closely at it showed that a step-back is only safe if the problems below are fixed first. The worker flows and `StaffShell` are exactly as they were before it. Packing's own "‹ Your pallets" link was never touched.

### Known gaps (all exist today unless it says otherwise)

1. **Drafts are not per user.**
   - A draft is saved on the device under `stf_draft_<item>` (`receiving-<order>`, `dispatch-<pallet>`, `feedTheSoil-log-<kit>`, `feedTheSoil-assign`). Nothing in the key or the data says whose it is, and logging out does not clear it. Code: `client/src/features/staff/hooks/useDraft.js`.
   - On a shared tablet, the next worker who opens the same order, pallet or kit gets the previous worker's counts, locations, use-by dates, driver, vehicle, kilograms and notes filled in, and can submit them as themselves.

2. **Receiving: a signature can carry over to another order, if a step-back is added.**
   - The signature is plain state in `ReceivingFlow.jsx` and is only cleared after a delivery is finished. Starting a different order does not clear it.
   - With a step-back, a worker could sign for order A, go back, open order B, and finish B with A's signature while the pad shows blank. Today there is no way back, so it is not reachable. It is the main reason Step D was reverted.
   - Related: if the pad is remounted for the same order, the signature is still held but not visible.

3. **Decanting: values carry over between sacks.**
   - Picking a different sack clears the bag plan, bag counts and ticks, but not the weights typed (kilograms on the scale, kilograms needed, spilled). They apply to the next sack unless retyped.
   - Decanting has no draft at all, so nothing is kept per sack and a reload loses everything.

4. **No duplicate-submit guard on decanting saves and Feed the Soil collection logs.**
   - Decanting: no idempotency key and no unique constraint, and a "sack" has no identity. Two saves make two records, and wastage is deducted from stock twice (wastage is the only thing decanting moves). A retry after a dropped connection can do the same.
   - Feed the Soil: every "log compost" makes a new record with no key or check, so a repeat doubles the kilograms in reports. No stock is involved.
   - Marking a Feed the Soil record dispatched is guarded (row lock, 409 "already marked dispatched"). So is confirming a dispatch (one dispatch event per slip, "already dispatched"), and receiving an order that was fully received.

5. **A partial purchase order can be received twice from two devices.**
   - Receiving locks the order and only accepts open orders. A delivery that closes the order blocks the next one. A partial delivery leaves the order open, so a second device can add the same stock again, and the server cannot tell a real second delivery from a duplicate.
   - Whether the order closes is decided by the client (`poCompleted`); the server trusts it rather than working it out from what has been received.
   - A retry from the same device is safe (idempotency key per attempt).

6. **Unfinished work shows other users' and completed items.**
   - The worker dashboard's "Unfinished work" (`UnfinishedWork.jsx`) lists every draft in the browser's storage, with no user filter, and "Throw away" works on all of them.
   - It never asks the server. A draft stays listed until the device that submitted clears it, or after 24 hours. If someone else finished the order or pallet from another device, it is still offered.
   - "Carry on" for a receiving draft only opens the order if it is still open, otherwise the worker lands on the order list and the draft stays. For a dispatch draft the pallet opens even if it was already dispatched.
   - It lists only receiving and dispatch drafts, not Feed the Soil.

7. **The "N lines counted" text on a receiving draft is too high.** The draft holds every line with its default count, including lines nobody touched, and a draft is written as soon as an order is opened.

### Planned design (not built)

- **Placement:** the step-back sits in the page content, under the History button and above the Guided/Form card. Labels: "‹ Back to deliveries", "‹ Back to sacks", "‹ Back to pallets", and for Feed the Soil the screen's parent ("‹ Back to kits", "‹ Back to kit", "‹ Back to records"). The `StaffShell` header keeps only the top-left arrow, unchanged. Packing is left alone.
- **Hidden while saving**, and not shown on the done screens.
- **Progress is kept per item on the device**: counts, ticks, weights, quantities, driver, notes, everything except the signature. Ticks are added to the Receiving and Dispatch drafts. Decanting gets a draft per sack (scale, needed, spilled, bag counts, ticks). Feed the Soil stays as it is.
- **The signature is never stored** and is always cleared when leaving or switching items. A test must show order B can never finish with order A's signature, in Receiving and Dispatch.
- **Drafts are keyed per user and item**, so a shared device never shows or submits someone else's work. "Unfinished work" shows only the signed-in worker's. Drafts already on devices (no user in the key) would be ignored; they expire within 24 hours.
- **Reopening an item with a draft** shows "You started this at <time>. Continue / Start over". Start over deletes that draft.
- **A line under the step-back button:** "Your progress on <item> is kept on this device." No confirmation pop-up.
- **Decanting weights no longer carry over** to a different sack.
- **Stale drafts:** when an item is reopened and someone has already completed it, do not offer Continue. Say "This was already completed by someone else" and delete the draft. "Unfinished work" does the same and does not list completed items. How "completed" is known:
  - Receiving: the order is no longer in the open orders list.
  - Dispatch: the pallet's gate view says it was already dispatched.
  - Decanting: a newer decanting record for that product exists since the draft started.
  - Feed the Soil log: the kit has a newer record than the one the draft started against (store the latest record id in the draft).
- **Idempotency keys** on the decanting save and the Feed the Soil collection log, the same pattern deliveries already use: a nullable key column with a unique index on each table (a migration), and the client sending a fresh key per attempt. This stops duplicates from retries and double submits.
- **Optional, not agreed:** an advisory check before saving a decanting or collection log when the same product (or kit) was recorded in the last 30 minutes ("Sipho recorded Maize meal at 09:12. Record this one as well?"), with the worker able to confirm. Two workers doing the same sack or collection cannot otherwise be detected.

### Decisions still open

- Whether to add the idempotency-key migration and the optional advisory check.
- Whether Decanting gets the per-sack draft or only a confirmation when leaving.
- Tests listed for whoever builds it: going back keeps progress, switching items keeps both separately, the signature is cleared, another user cannot see or submit your draft, Start over clears, a stale draft is discarded, and the back button is hidden while saving.
