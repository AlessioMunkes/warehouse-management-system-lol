import { Card, CardContent } from '@/components/ui/card';

export default function AttendanceSummary({ summaries }) {
  const total = summaries.reduce((sum, row) => ({ booked: sum.booked + row.booked, attended: sum.attended + row.attended, noShow: sum.noShow + row.noShow }), { booked: 0, attended: 0, noShow: 0 });
  return <div className="grid grid-cols-3 gap-3" aria-label="Attendance summary">
    {[['Booked', total.booked], ['Attended', total.attended], ['No-show', total.noShow]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}
  </div>;
}
