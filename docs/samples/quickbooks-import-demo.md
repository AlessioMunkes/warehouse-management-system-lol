# Import QuickBooks links: test checklist and demo script

Files in this folder:

- `quickbooks-po-export-sample.csv`: shaped like a QuickBooks Online PO export (title row, blank row, then Date, Num, Vendor, Memo, Amount, Status). QuickBooks numbers are `DEMO-1001` to `DEMO-1008` so they can never be mistaken for real ones, and so the undo can only match them.
- `undo-demo-quickbooks-links.sql`: removes only the demo links. You run it yourself.

The file uses POs that exist in the database: `PO-2026-0101` to `PO-2026-0106`. None of them had a QuickBooks link when this was written (checked with SELECT only; the table held 0 links). `PO-2026-0999` does not exist, on purpose.

## What the sample file shows

| Row (Num) | Memo | What the preview says |
|---|---|---|
| DEMO-1001 | `PO-2026-0101` | Will link |
| DEMO-1002 | `wms po-2026-0102` | Will link |
| DEMO-1003 | `Ref PO-2026-0103 rice order` | Will link |
| DEMO-1004 | `Printer paper and toner` | No PO number (collapsed, normal) |
| DEMO-1005 | `PO-2026-0999` | PO number not found |
| DEMO-1006 | `PO-2026-0105 and PO-2026-0106 …` | Needs review: two PO numbers in one row |
| DEMO-1007, DEMO-1008 | both mention `PO-2026-0104` | Needs review: PO number in more than one row |

Expected counts: 3 will link, 0 conflicts, 3 need review, 1 not found, 1 without a PO number.

## Before you start (once)

1. Run section 0 of the undo SQL and keep the three results (time, link count, audit row count).
2. Sign in as a manager or admin.

## Manual test checklist

Import file
- [ ] Purchase orders shows **Import QuickBooks links** for a manager and an admin.
- [ ] A warehouse worker does not see the button (and the server refuses the endpoints).
- [ ] A `.pdf` is refused with a clear message. `.csv` and `.xlsx` are accepted.
- [ ] The sample opens with **Num** already chosen in the column dropdown.
- [ ] Choosing **Memo** instead (wrong column) does not break anything; the preview just has no usable numbers.

Preview
- [ ] The summary line and the headings show the expected counts above.
- [ ] Needs review has no tickboxes and says why for each row.
- [ ] Rows without a PO number are collapsed and counted.
- [ ] Not found lists `PO-2026-0999`.

Conflicts (do this once, then undo)
- [ ] On `PO-2026-0102`, edit the QuickBooks PO number by hand and save `DEMO-OLD`.
- [ ] Re-import the sample: 1 conflict, "Replaces DEMO-OLD", collapsed, not ticked.
- [ ] Continue without ticking: only 2 will link, and the conflict is untouched.
- [ ] Re-import and tick it: the confirm page says one PO will switch to a different QuickBooks PO number, and **Show which** names `PO-2026-0102`.

Apply and re-run
- [ ] Confirm: result says the links were saved. Open `PO-2026-0101`: "Linked to QuickBooks PO number DEMO-1001".
- [ ] Import the same file again: 3 already linked, nothing to link, **Continue to confirm** is off.
- [ ] Rows in needs review, not found and no PO number were not linked.

Afterwards
- [ ] Run the undo SQL (steps 1 to 3). Section 3 checks all pass.

## Monday demo script (4 steps)

1. **Show the email.** Open a new PO's Finance email: PO number first in the subject, and the line "type PO-… into the QuickBooks PO's Memo field". "Finance only has to type our number into QuickBooks. They never send anything back."
2. **Upload the export.** On Purchase orders, select **Import QuickBooks links**, upload the sample, leave **Num** chosen, select **Check the file**. Point at the counts: 3 will link, 3 need review, 1 not found, 1 not ours. "It never guesses. Anything unclear is skipped and listed."
3. **Open the problems.** Open Needs review (two POs in one row, one PO twice), then Not found. "Nothing here can be applied from the import." Optional: if you set up the `DEMO-OLD` conflict beforehand, open Conflicts: "Not applied unless you tick it."
4. **Confirm and show the result.** Continue to confirm ("3 will link."), link, then open `PO-2026-0101`: "Linked to QuickBooks PO number DEMO-1001". Upload the same file again to show it is harmless: 3 already linked.

## Undo afterwards

Run `undo-demo-quickbooks-links.sql` yourself (Supabase SQL editor or psql). It deletes only links on `PO-2026-0101` to `PO-2026-0106` whose QuickBooks number starts with `DEMO-`, shows you the rows first, runs inside a transaction you can roll back, and leaves `audit_log` alone. Section 3 then checks that no demo links remain, the total is back to your snapshot, and the only audit rows written during the demo are `quickbooks_ref_set` on those six POs.

The slower alternative with no SQL: open each demo PO and clear its QuickBooks PO number by hand. That also works, but it adds an audit row per PO.
