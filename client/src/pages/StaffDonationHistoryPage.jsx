// ─────────────────────────────────────────────────────────────
// client/src/pages/StaffDonationHistoryPage.jsx
//
// My donations: every donation this worker recorded, what they filled
// in, and where it has got to. Asked for from the floor: recording a
// donation was a form and nothing after it, so a worker who needed to
// check what they had entered, or whether a manager had dealt with it
// yet, had no way back to it.
//
// Reads pending_donations, which is where every donation the floor
// records starts (ReviewPage → createPendingDonation), so one waiting
// on a manager is here as well as one already in stock. Scoped to the
// signed-in worker on the server. Reached from a History link on the
// donation screen's header, the same place Receiving keeps its own.
//
// The same HistoryScreen every worker history uses; "View" opens what
// was filled in, item by item, read-only.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { KeyValues, Notice } from '../features/staff/StepPrimitives';
import HistoryScreen, { HistoryRow } from '../features/staff/HistoryScreen';
import { byNewest, byOldest, byNumber, byText } from '../features/staff/historyView';
import StatusBadge from '@/components/ui/status-badge';
import { workerStatus } from '../features/staff/workerStatus';
import { getMyDonations, getMyDonation } from '../services/donationAPI';
import { fmtQty } from '../lib/quantity';
import { STAFF } from '../routes/paths';

const STATUS_LABEL = {
  committed: 'Recorded',
  awaiting_resolution: 'Waiting for a manager',
  draft: 'Being saved',
  committing: 'Being saved',
  commit_failed: 'Needs a manager',
  commit_incomplete: 'Needs a manager',
  cancelled: 'Cancelled',
};
const ITEM_LABEL = {
  awaiting_resolution: 'Waiting for a manager',
  resolved: 'Accepted',
  committed: 'Recorded',
  rejected: 'Not accepted',
  cancelled: 'Cancelled',
};

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const formatRand = (value) =>
  value === null || value === undefined || value === ''
    ? null
    : `R ${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const donorOf = (d) =>
  d.donor_name
  || [d.donor_first_name, d.donor_last_name].filter(Boolean).join(' ')
  || 'Anonymous donor';

const SORTS = [
  { key: 'newest', label: 'Newest first', compare: byNewest((d) => d.created_at) },
  { key: 'oldest', label: 'Oldest first', compare: byOldest((d) => d.created_at) },
  { key: 'value', label: 'Highest value', compare: byNumber((d) => d.estimated_value_zar) },
  { key: 'donor', label: 'Donor A to Z', compare: byText(donorOf) },
];
const FILTERS = [
  { key: 'status', label: 'Status', valueOf: (d) => STATUS_LABEL[d.status] ?? d.status },
  {
    key: 'food', label: 'Food',
    valueOf: (d) => (d.donation_category ? (d.donation_category === 'non_food' ? 'no' : 'yes') : null),
    labelOf: (v) => (v === 'yes' ? 'Food' : 'Not food'),
  },
  {
    key: 's18a', label: 'Section 18A',
    valueOf: (d) => (d.section18a_requested ? 'yes' : 'no'),
    labelOf: (v) => (v === 'yes' ? 'Requested' : 'Not requested'),
  },
];
const searchText = (d) => [donorOf(d), d.notes].filter(Boolean).join(' ');

// What was filled in, as it was filled in. Read-only.
function DonationRecord({ id, onClose }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMyDonation(id)
      .then((r) => { if (!cancelled) setRecord(r); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not open this donation.'); });
    return () => { cancelled = true; };
  }, [id]);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="stf-shell stf-donation-record" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{record ? donorOf(record) : 'Donation'}</DialogTitle>
        </DialogHeader>

        {error ? <Notice tone="warn">{error}</Notice> : null}
        {!record && !error ? <div className="stf-skeleton" aria-label="Loading" /> : null}

        {record ? (
          <>
            <p className="stf-slip-state">
              <StatusBadge {...workerStatus('donation', record.status)}>
                {STATUS_LABEL[record.status] ?? record.status}
              </StatusBadge>
              <span className="stf-row-meta">{`Recorded ${formatDate(record.created_at)}`}</span>
            </p>
            <KeyValues
              pairs={[
                ['Donor', donorOf(record)],
                record.donor_contact ? ['Email', record.donor_contact] : null,
                ['Section 18A', record.section18a_requested ? 'Requested' : 'Not requested'],
                ['Estimated value', formatRand(record.estimated_value_zar) ?? '-'],
                ['Food', record.donation_category ? (record.donation_category === 'non_food' ? 'No' : 'Yes') : '-'],
                record.notes ? ['Notes', record.notes] : null,
              ]}
            />
            <p className="stf-summary-title">Items</p>
            <div className="stf-list">
              {(record.items ?? []).map((item) => (
                <div key={item.id} className="stf-row is-static">
                  <span className="stf-row-main">
                    <span className="stf-row-title">{item.description}</span>
                    <span className="stf-row-meta">
                      {[fmtQty(item.quantity, item.unit), formatRand(item.estimated_value_zar), item.rejection_reason]
                        .filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <StatusBadge {...workerStatus('donationItem', item.status)}>
                    {ITEM_LABEL[item.status] ?? item.status}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <DialogFooter>
          <button type="button" className="stf-btn stf-btn-primary" onClick={onClose}>Close</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffDonationHistoryPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState('week');
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await getMyDonations(range);
        if (!cancelled) setDonations(list);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  return (
    <StaffShell crumb="Donations / My donations" onBack={() => navigate(STAFF.donation)}>
      <HistoryScreen
        title="My donations"
        sub="Every donation you recorded, and where it has got to."
        error={error}
        range={range}
        onRangeChange={setRange}
        loading={loading}
        rows={donations}
        search={searchText}
        searchPlaceholder="Search by donor"
        searchId="stf-donations-search"
        sorts={SORTS}
        filters={FILTERS}
        empty="You have not recorded a donation in this range."
        noun="donations"
        renderRow={(d) => (
          <HistoryRow
            title={donorOf(d)}
            meta={[
              formatDate(d.created_at),
              `${d.item_count} ${Number(d.item_count) === 1 ? 'item' : 'items'}`,
              formatRand(d.estimated_value_zar),
              d.awaiting_count > 0 ? `${d.awaiting_count} waiting for a manager` : null,
            ].filter(Boolean).join(' · ')}
            badges={(
              <StatusBadge {...workerStatus('donation', d.status)}>
                {STATUS_LABEL[d.status] ?? d.status}
              </StatusBadge>
            )}
            action={{ label: 'View', onClick: () => setOpenId(d.id) }}
          />
        )}
      />

      {openId ? <DonationRecord id={openId} onClose={() => setOpenId(null)} /> : null}
    </StaffShell>
  );
}
