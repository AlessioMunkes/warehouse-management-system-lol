// Booked, attended and no-show across every timeslot, as one strip of
// figures above the bookings table rather than three cards of their own.
export default function AttendanceSummary({ summaries }) {
  const total = summaries.reduce((sum, row) => ({ booked: sum.booked + row.booked, attended: sum.attended + row.attended, noShow: sum.noShow + row.noShow }), { booked: 0, attended: 0, noShow: 0 });
  return <dl className="grid grid-cols-3 divide-x rounded-lg border" aria-label="Attendance summary">
    {[['Booked', total.booked], ['Attended', total.attended], ['No-show', total.noShow]].map(([label, value]) => (
      <div key={label} className="px-4 py-3">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-xl font-medium tabular-nums">{value}</dd>
      </div>
    ))}
  </dl>;
}
