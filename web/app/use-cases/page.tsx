import Link from "next/link";

export const metadata = {
  title: "Use Cases — DePIN Data Exchange",
  description: "Real B2B scenarios that buy and sell verified IoT data on the marketplace.",
};

type UseCase = {
  slug: string;
  title: string;
  industry: string;
  pitch: string;
  buyer: string;
  provider: string;
  sampleQuery: string;
  cadence: string;
};

const useCases: UseCase[] = [
  {
    slug: "fleet-logistics",
    title: "Fleet Logistics — Real-Time GPS",
    industry: "Logistics",
    pitch:
      "Last-mile delivery fleets correlate Hivemapper dashcam tracks with their own routes to flag detours, idle time, and missed stops within minutes instead of waiting for end-of-day driver reports.",
    buyer: "Mid-size logistics carrier (50–500 vehicles)",
    provider: "Hivemapper hotspot operator with overlapping coverage",
    sampleQuery: 'GET /v1/listings/{listing_id}/data?bbox=lat1,lng1,lat2,lng2&since=NOW-15m',
    cadence: "Streaming with 60s rollups",
  },
  {
    slug: "micro-weather",
    title: "Micro-Weather — Hyper-Local Forecasting",
    industry: "Insurance / Agtech",
    pitch:
      "Crop-insurance underwriters and irrigation controllers buy distributed sensor feeds covering their exact parcels, replacing 5–10 km coarse-grid forecasts with 250 m–1 km observed conditions.",
    buyer: "Parametric crop insurer underwriting harvest contracts",
    provider: "Mesh of community weather stations with Pyth-attested readings",
    sampleQuery: 'GET /v1/listings/{listing_id}/data?lat=51.05&lng=-114.07&radius_km=2',
    cadence: "5-minute rollups, 30-day archive",
  },
  {
    slug: "urban-air-quality",
    title: "Urban Air Quality — Compliance Reporting",
    industry: "Environmental / Civic Tech",
    pitch:
      "City sustainability offices subscribe to networks of low-cost PM2.5 / NO₂ sensors to build neighbourhood-resolution dashboards and feed regulatory reports without operating the hardware themselves.",
    buyer: "Municipal environmental agency",
    provider: "Citizen-run sensor networks signed with the operator's wallet",
    sampleQuery: 'GET /v1/listings/{listing_id}/data?cell=ny-09&metrics=pm25,no2',
    cadence: "Hourly aggregates",
  },
];

export default function UseCasesPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-12">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-amber-700">B2B</p>
        <h1 className="mt-2 text-4xl font-bold text-stone-900">Use Cases</h1>
        <p className="mt-3 max-w-2xl text-stone-600">
          Three teams that already pay for verified IoT data through the exchange. Each comes with a sample query so you can sketch the integration before opening a subscription.
        </p>
      </header>

      <ul className="space-y-8">
        {useCases.map((u) => (
          <li
            key={u.slug}
            className="rounded-lg border border-stone-200 bg-stone-50/60 p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-semibold text-stone-900">{u.title}</h2>
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-amber-800">
                {u.industry}
              </span>
            </div>

            <p className="mt-3 text-stone-700">{u.pitch}</p>

            <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
                  Typical Buyer
                </dt>
                <dd className="mt-1 text-stone-800">{u.buyer}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
                  Typical Provider
                </dt>
                <dd className="mt-1 text-stone-800">{u.provider}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
                  Cadence
                </dt>
                <dd className="mt-1 text-stone-800">{u.cadence}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
                  Sample Query
                </dt>
                <dd className="mt-1 break-all rounded bg-stone-900/95 px-2 py-1 font-mono text-[11px] text-amber-100">
                  {u.sampleQuery}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <footer className="mt-12 border-t border-stone-200 pt-6">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 text-sm font-medium text-amber-800 hover:text-amber-900"
        >
          Browse live listings &rarr;
        </Link>
      </footer>
    </div>
  );
}
