/**
 * TimeslotPanel - read-only event schedule and capacity summary.
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const readable = (value) => value ? new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value)) : 'Not set';

export default function TimeslotPanel({
  timeslots,
  capacityBySlot,
  spaces,
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule and capacity</CardTitle>
        <CardDescription>Event setup is managed when the event is created.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {timeslots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No timeslots configured.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {timeslots.map((slot) => {
              const summary = capacityBySlot[slot.id];
              const used = summary?.capacity ? Math.min(100, (summary.booked / summary.capacity) * 100) : 0;
              const space = spaces.find((item) => item.id === slot.spaceId);
              return (
                <div key={slot.id} className="grid gap-3 rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{readable(slot.startTime)}</p>
                      <p className="text-xs text-muted-foreground">to {readable(slot.endTime)}</p>
                      <p className="mt-1 text-sm">{space?.name ?? 'Unknown space'}{space?.location ? ` - ${space.location}` : ''}</p>
                    </div>
                    <Badge variant="outline">{slot.status}</Badge>
                  </div>
                  {summary ? (
                    <div>
                      <div className="mb-2 flex justify-between text-sm">
                        <span>{summary.booked} booked</span>
                        <span>{summary.remaining} remaining</span>
                      </div>
                      <Progress value={used} />
                      <p className="mt-1 text-xs text-muted-foreground">Capacity {summary.capacity}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Capacity unavailable.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
