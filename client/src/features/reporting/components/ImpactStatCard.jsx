// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ImpactStatCard.jsx
//
// The "poster" treatment for one of the four Impact Calculator
// headline numbers — a request to make the on-screen page (and, by
// extension, its PDF export) read as something worth printing and
// pinning up, not just a reporting screen. Same real data and the
// same CountUp component ImpactReportPage.jsx's old inline StatCard
// used; this only changes how much room the number and the caption
// get, and adds the illustration.
//
// image vs graphic: three of the four cards get a real illustration
// (child-bowl.svg, person-waving.svg, farmer-compost.svg — provided
// separately, not generated here). Paper saved has no accompanying
// photo, so it gets a small drawn document-stack instead of an empty
// panel — see PaperGraphic below.
//
// The image tint behind each illustration is the stat's own colour at
// low opacity, not a fixed neutral — "muted enough to fit the app's
// own colour scheme" was the brief, and this is the same soft-tinted-
// circle convention the app already uses for every stat icon badge
// (ManagerDashboardPage's StatTile, this page's old StatCard).
// ─────────────────────────────────────────────────────────────
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import CountUp from './CountUp';

// A stand-in for "Paper saved," which has no companion photo — a
// small stack of document lines with a red PDF corner-badge, drawn
// rather than photographed since the fact itself (documents not
// printed) is already abstract. Plain SVG/CSS, no new asset.
const PaperGraphic = () => (
  <div className="relative flex h-full w-full items-center justify-center">
    <div className="flex w-24 flex-col gap-2 rounded-md bg-white p-4 shadow-sm ring-1 ring-black/5">
      {[100, 82, 92, 60].map((w, i) => (
        <span key={i} className="block h-1.5 rounded-full bg-[#e9e3dd]" style={{ width: `${w}%` }} />
      ))}
    </div>
    <div className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-[#ef3a40] text-[10px] font-bold text-white shadow-sm">
      PDF
    </div>
  </div>
);

const Illustration = ({ src, alt, color }) => (
  <div
    className="relative hidden h-full min-h-[180px] w-full items-center justify-center overflow-hidden rounded-2xl sm:flex"
    style={{ backgroundColor: `${color}14` }}
  >
    {src ? (
      <img
        src={src}
        alt={alt}
        className="h-[85%] w-[85%] object-contain"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    ) : (
      <PaperGraphic />
    )}
  </div>
);

export default function ImpactStatCard({ def, stat }) {
  const { image } = def;
  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{def.label}</p>

          {!stat ? (
            <Skeleton className="mt-2 h-10 w-32" />
          ) : stat.notReady ? (
            <p className="mt-2 text-sm text-muted-foreground">{stat.message || 'Not set up yet'}</p>
          ) : stat.error ? (
            <p className="mt-2 text-sm text-[#ef3a40]">Couldn't load</p>
          ) : (
            <>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-5xl font-bold tracking-tight" style={{ color: def.color }}>
                  <CountUp value={stat.value} />
                </span>
                <span className="text-base font-medium text-muted-foreground">{def.unit}</span>
              </p>
              {stat.caption ? (
                <p className="mt-2 text-sm text-muted-foreground">{stat.caption}</p>
              ) : null}
            </>
          )}
        </div>

        <div className="h-40 w-full sm:h-44 sm:w-44">
          <Illustration src={image} alt="" color={def.color} />
        </div>
      </CardContent>
    </Card>
  );
}
