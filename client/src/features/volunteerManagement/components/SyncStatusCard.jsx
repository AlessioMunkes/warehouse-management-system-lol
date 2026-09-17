/**
 * SyncStatusCard — VMS Synchronization Status Display
 *
 * This card displays the current synchronization status between the WMS
 * and the external Volunteer Management System (VMS). It shows:
 *   - Current sync status (SYNCED, FAILED, etc.)
 *   - Error messages when sync fails
 *   - Timestamp of last successful sync
 *   - Retry button for failed synchronizations
 *
 * Event booking publication to VMS happens automatically during booking management.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SyncStatusCard({ sync, busy, onRetry }) {
  return <Card><CardHeader><CardTitle>VMS sync</CardTitle><CardDescription>Event booking publication is automatic.</CardDescription></CardHeader><CardContent>
    {!sync ? <p className="text-sm text-muted-foreground">Sync begins after booking configuration is saved.</p> : <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><Badge variant={sync.status === 'FAILED' ? 'destructive' : 'outline'}>{sync.status}</Badge>{sync.errorMessage && <p role="alert" className="mt-2 text-sm text-destructive">{sync.errorMessage}</p>}{sync.lastSuccessAt && <p className="mt-2 text-xs text-muted-foreground">Last synced {new Date(sync.lastSuccessAt).toLocaleString('en-ZA')}</p>}</div>{sync.status === 'FAILED' && <Button onClick={onRetry} disabled={busy}>{busy ? 'Retrying…' : 'Retry sync'}</Button>}</div>}
  </CardContent></Card>;
}
