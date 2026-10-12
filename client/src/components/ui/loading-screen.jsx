// ─────────────────────────────────────────────────────────────
// client/src/components/ui/loading-screen.jsx
//
// THE LOADING MARK, one for the whole app: the Batches mark inside a
// turning ring. It sits IN the thing that is loading, and only that.
// A list that is loading shows it where the list will be, and the rest
// of the screen stays as it is and stays usable.
//
// WHERE IT COMES FROM
//   a part of a screen   every loading placeholder in the app already
//                        marks out the space of the thing it stands in
//                        for: <Skeleton> on manager and admin screens,
//                        .stf-skeleton on the floor, .gst-skeleton for
//                        volunteers. The mark is drawn inside those by
//                        styles/index.css, so every one of them has it
//                        with nothing changed where they are used. A
//                        placeholder too small to hold it (a line of
//                        text, a button) stays a plain pulsing bar.
//   a whole page         this component. The first time a screen is
//                        opened its code has to arrive (the Suspense
//                        fallback in App.jsx): the mark fills the page
//                        area, inside the sidebar and top bar.
//   the app itself       this component with `page`. While the app is
//                        asking the server who is signed in there is
//                        nothing to show yet, so it takes the window
//                        (ProtectedRoute.jsx).
//
// `delayed` holds it back a moment, so a page that arrives at once
// shows nothing instead of a flash.
// ─────────────────────────────────────────────────────────────
import batchesLogo from '../../assets/Batches_Logo.jpeg';
import { useT } from '../../translations';

export default function LoadingScreen({ label, page = false, delayed = false, className = '' }) {
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-4
        ${page ? 'fixed inset-0 z-[200] bg-background' : 'min-h-[60vh] w-full'}
        ${delayed ? 'loading-screen-delayed' : 'loading-screen-in'} ${className}`}
    >
      <div className="relative flex size-20 items-center justify-center">
        <span aria-hidden="true" className="absolute inset-0 rounded-full border-[3px] border-line" />
        <span aria-hidden="true" className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-ink motion-safe:animate-spin" />
        <img src={batchesLogo} alt="" className="size-12 rounded-xl object-cover" />
      </div>
      <p className="text-sm font-semibold text-ink">{label ?? t('common.loading')}</p>
    </div>
  );
}
