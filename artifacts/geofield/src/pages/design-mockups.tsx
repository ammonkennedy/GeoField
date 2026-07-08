import {
  BarChart3,
  CalendarDays,
  Camera,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Compass,
  Database,
  Download,
  Filter,
  Layers,
  Map,
  MapPin,
  Mountain,
  Navigation,
  Plus,
  Search,
  SlidersHorizontal,
  Triangle,
  Waves,
} from "lucide-react";
import { Layout } from "@/components/Layout";

const samples = [
  { id: "RS-2041", type: "Rock", unit: "Navajo Sandstone", color: "#9a5a38", loc: "38.5734211, -109.5493228", status: "Synced" },
  { id: "SS-2042", type: "Soil", unit: "Sandy loam", color: "#b08a3c", loc: "38.5741902, -109.5510044", status: "Local" },
  { id: "WS-2043", type: "Water", unit: "Spring seep", color: "#357f9e", loc: "38.5728841, -109.5481277", status: "Synced" },
];

const parameters = [
  ["Strike", "042"],
  ["Dip", "31 NE"],
  ["Accuracy", "2.8 m"],
  ["UTM", "12S 626419E"],
];

function MiniTopoMap({ dark = false }: { dark?: boolean }) {
  const lineColor = dark ? "rgba(197, 215, 196, 0.16)" : "rgba(82, 98, 70, 0.2)";
  return (
    <div className={dark ? "relative h-full min-h-[280px] overflow-hidden bg-[#1e2621]" : "relative h-full min-h-[280px] overflow-hidden bg-[#dfe4d2]"}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 640 360" preserveAspectRatio="none">
        <rect width="640" height="360" fill={dark ? "#1e2621" : "#dfe4d2"} />
        {Array.from({ length: 10 }).map((_, i) => (
          <path
            key={i}
            d={`M ${-40 + i * 38} ${325 - i * 28} C ${120 + i * 18} ${255 - i * 18}, ${172 + i * 28} ${115 + i * 14}, ${366 + i * 26} ${128 - i * 8} S ${610 + i * 18} ${52 + i * 18}, 700 ${92 + i * 24}`}
            fill="none"
            stroke={lineColor}
            strokeWidth="2"
          />
        ))}
        <path d="M0 238 C130 196 202 246 318 201 S511 126 640 161" fill="none" stroke={dark ? "#547f8c" : "#6b99a1"} strokeWidth="5" opacity="0.62" />
        <path d="M416 0 L244 360" stroke={dark ? "#635a47" : "#b99b6a"} strokeWidth="7" opacity="0.55" />
      </svg>
      <div className="absolute left-[24%] top-[34%] h-3 w-3 rounded-full border-2 border-white bg-[#9a5a38] shadow-lg" />
      <div className="absolute left-[48%] top-[52%] h-3 w-3 rounded-full border-2 border-white bg-[#b08a3c] shadow-lg" />
      <div className="absolute left-[66%] top-[40%] h-3 w-3 rounded-full border-2 border-white bg-[#357f9e] shadow-lg" />
      <div className={dark ? "absolute bottom-4 left-4 rounded border border-white/10 bg-black/35 px-3 py-2 text-xs text-[#d8e0d3]" : "absolute bottom-4 left-4 rounded border border-[#7c806f]/25 bg-white/72 px-3 py-2 text-xs text-[#3a4037]"}>
        USGS topo + sample overlay
      </div>
    </div>
  );
}

function ConceptShell({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className: string;
}) {
  return (
    <section className={`overflow-hidden border shadow-sm ${className}`}>
      <div className="flex flex-col gap-2 border-b px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">{title}</h2>
          <p className="text-sm opacity-75">{subtitle}</p>
        </div>
        <div className="flex gap-2 text-xs font-semibold uppercase tracking-wide opacity-75">
          <span>Map</span>
          <span>Samples</span>
          <span>Export</span>
        </div>
      </div>
      {children}
    </section>
  );
}

function TopographicSystem() {
  return (
    <ConceptShell
      title="Topographic Field System"
      subtitle="Map-first, compact, field-ready. This is the strongest overall GeoField direction."
      className="border-[#c5bfae] bg-[#f4f1e8] text-[#202522]"
    >
      <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-[240px_1fr_320px]">
        <aside className="border-b border-[#c5bfae] bg-[#e8e0cf] p-4 lg:border-b-0 lg:border-r">
          <div className="mb-6 flex items-center gap-2 font-semibold">
            <Mountain className="h-5 w-5 text-[#496b4a]" />
            GeoField
          </div>
          <div className="space-y-1 text-sm">
            {["All Samples", "Map View", "Trips", "Strike & Dip"].map((item, i) => (
              <div key={item} className={i === 1 ? "flex items-center gap-2 rounded bg-[#496b4a] px-3 py-2 text-white" : "flex items-center gap-2 rounded px-3 py-2 text-[#4f574c]"}>
                {i === 0 ? <CircleDot className="h-4 w-4" /> : i === 1 ? <Map className="h-4 w-4" /> : i === 2 ? <Navigation className="h-4 w-4" /> : <Compass className="h-4 w-4" />}
                {item}
              </div>
            ))}
          </div>
          <div className="mt-8 border-t border-[#c5bfae] pt-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#6a6f60]">Datasets</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Moab Recon</span><span>18</span></div>
              <div className="flex justify-between"><span>Layer Logs</span><span>7</span></div>
              <div className="flex justify-between"><span>Water Sites</span><span>4</span></div>
            </div>
          </div>
        </aside>
        <main className="min-h-[360px]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#c5bfae] bg-[#fbf8ef] p-3">
            <div className="flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded border border-[#c5bfae] bg-white px-3 text-sm text-[#6a6f60]">
              <Search className="h-4 w-4" />
              Search sample ID, unit, or coordinate
            </div>
            <button className="flex h-9 items-center gap-2 rounded border border-[#c5bfae] bg-white px-3 text-sm"><Layers className="h-4 w-4" />Layers</button>
            <button className="flex h-9 items-center gap-2 rounded bg-[#b45a37] px-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Sample</button>
          </div>
          <MiniTopoMap />
        </main>
        <aside className="border-t border-[#c5bfae] bg-[#fbf8ef] p-4 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-[#6a6f60]">Selected Sample</div>
              <h3 className="mt-1 text-2xl font-semibold tracking-normal">RS-2041</h3>
            </div>
            <span className="rounded bg-[#496b4a] px-2 py-1 text-xs font-semibold text-white">Rock</span>
          </div>
          <div className="mb-4 space-y-3 text-sm">
            {parameters.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-[#e1d8c6] pb-2">
                <span className="text-[#6a6f60]">{label}</span>
                <span className="font-mono font-semibold">{value}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded border border-[#c5bfae] bg-white py-2 text-sm">Edit</button>
            <button className="rounded bg-[#202522] py-2 text-sm text-white">Export</button>
          </div>
        </aside>
      </div>
    </ConceptShell>
  );
}

function GisWorkbench() {
  return (
    <ConceptShell
      title="GIS Workbench"
      subtitle="More technical and dense. Best if the app should feel like a serious mapping/database tool."
      className="border-[#cfd5d8] bg-[#eef1f2] text-[#172026]"
    >
      <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[300px_1fr]">
        <aside className="border-b border-[#cfd5d8] bg-white p-4 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center justify-between">
            <div className="font-semibold">Project Layers</div>
            <SlidersHorizontal className="h-4 w-4 text-[#5d6870]" />
          </div>
          <div className="space-y-2">
            {["USGS Imagery", "Regional Geology", "Soil Types", "Sample Locations", "Trip Sites"].map((layer, i) => (
              <div key={layer} className="flex items-center justify-between rounded border border-[#dce1e3] bg-[#f8fafb] px-3 py-2 text-sm">
                <span>{layer}</span>
                <span className={i < 4 ? "h-2 w-2 rounded-full bg-[#2f6f73]" : "h-2 w-2 rounded-full bg-[#b7bec2]"} />
              </div>
            ))}
          </div>
          <div className="mt-5">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#66727a]">Sample Query</div>
            <div className="rounded border border-[#cfd5d8] bg-[#f8fafb] p-3">
              <div className="mb-2 flex items-center gap-2 text-sm text-[#66727a]"><Filter className="h-4 w-4" />Type = Rock</div>
              <div className="flex items-center gap-2 text-sm text-[#66727a]"><CalendarDays className="h-4 w-4" />Last 14 days</div>
            </div>
          </div>
        </aside>
        <main>
          <div className="grid grid-cols-2 border-b border-[#cfd5d8] bg-white md:grid-cols-4">
            {["42 Samples", "8 Datasets", "3 Trips", "2 Pending"].map((stat) => (
              <div key={stat} className="border-r border-[#e2e6e8] px-4 py-3 last:border-r-0">
                <div className="text-xs uppercase tracking-wide text-[#66727a]">Current View</div>
                <div className="font-semibold">{stat}</div>
              </div>
            ))}
          </div>
          <div className="grid min-h-[430px] grid-cols-1 xl:grid-cols-[1fr_360px]">
            <MiniTopoMap />
            <div className="border-t border-[#cfd5d8] bg-white xl:border-l xl:border-t-0">
              <div className="flex items-center justify-between border-b border-[#e2e6e8] px-4 py-3">
                <div className="font-semibold">Sample Table</div>
                <Download className="h-4 w-4 text-[#66727a]" />
              </div>
              {samples.map((sample) => (
                <div key={sample.id} className="grid grid-cols-[10px_1fr_auto] items-center gap-3 border-b border-[#edf0f1] px-4 py-3 text-sm">
                  <span className="h-10 rounded-sm" style={{ background: sample.color }} />
                  <div>
                    <div className="font-mono font-semibold">{sample.id}</div>
                    <div className="text-xs text-[#66727a]">{sample.unit}</div>
                  </div>
                  <span className="rounded border border-[#dce1e3] px-2 py-1 text-xs">{sample.status}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </ConceptShell>
  );
}

function FieldNotebook() {
  return (
    <ConceptShell
      title="Field Notebook"
      subtitle="Warmer and more tactile. Best if sample entry and daily logs should feel central."
      className="border-[#d7c8a7] bg-[#f7f0df] text-[#2a251d]"
    >
      <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[1fr_340px]">
        <main className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#d7c8a7] pb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-[#766b57]">Daily Field Sheet</div>
              <h3 className="text-2xl font-semibold tracking-normal">Moab Recon - July 03</h3>
            </div>
            <button className="rounded border border-[#9f7c45] bg-[#fffaf0] px-3 py-2 text-sm font-semibold">New Entry</button>
          </div>
          <div className="space-y-3">
            {samples.map((sample, i) => (
              <div key={sample.id} className="grid gap-3 border-b border-[#dfd0ae] bg-[#fffaf0] p-4 md:grid-cols-[130px_1fr_120px]">
                <div>
                  <div className="font-mono text-lg font-bold">{sample.id}</div>
                  <div className="mt-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white" style={{ background: sample.color }}>
                    {sample.type === "Water" ? <Waves className="h-3 w-3" /> : sample.type === "Rock" ? <Triangle className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                    {sample.type}
                  </div>
                </div>
                <div>
                  <div className="font-semibold">{sample.unit}</div>
                  <div className="mt-1 flex items-center gap-1 text-sm text-[#766b57]"><MapPin className="h-3.5 w-3.5" />{sample.loc}</div>
                  <p className="mt-2 text-sm leading-relaxed text-[#4f4638]">
                    {i === 0 ? "Cross-bedded sandstone, oxidized surface, moderate weathering. Photo and strike/dip attached." : i === 1 ? "Loose sandy loam near wash margin. Slight moisture below 10 cm." : "Clear spring seep, low flow, algae along rock lip."}
                  </p>
                </div>
                <div className="flex items-center justify-between md:flex-col md:items-end">
                  <span className="flex items-center gap-1 text-xs font-semibold text-[#496b4a]"><CheckCircle2 className="h-3.5 w-3.5" />{sample.status}</span>
                  <div className="flex gap-2 text-[#766b57]">
                    <Camera className="h-4 w-4" />
                    <ClipboardList className="h-4 w-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
        <aside className="border-t border-[#d7c8a7] bg-[#eee2c7] p-5 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center gap-2 font-semibold"><Database className="h-5 w-5 text-[#9a5a38]" />Dataset Summary</div>
          <div className="space-y-3">
            {["Rock samples", "Soil samples", "Water samples"].map((label, i) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span>{[18, 9, 4][i]}</span></div>
                <div className="h-2 rounded bg-[#d6c49d]"><div className="h-2 rounded bg-[#496b4a]" style={{ width: `${[78, 42, 24][i]}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded border border-[#d7c8a7] bg-[#fffaf0] p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4" />Export Preview</div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded border border-[#d7c8a7] bg-[#d7c8a7] text-xs">
              {["ID", "Type", "Strike", "RS-2041", "Rock", "042", "SS-2042", "Soil", "-"].map((cell) => (
                <div key={cell} className="bg-[#fffaf0] px-2 py-1">{cell}</div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </ConceptShell>
  );
}

export default function DesignMockupsPage() {
  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-8 pb-16">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-6">
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">GeoField Visual Directions</div>
          <h1 className="text-3xl font-semibold tracking-normal md:text-4xl">Interface Mockups</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            These are static design studies for the app shell, map view, sample tables, and field logging. Pick the direction that feels closest, then I can apply it to the real screens.
          </p>
        </div>
        <TopographicSystem />
        <GisWorkbench />
        <FieldNotebook />
      </div>
    </Layout>
  );
}
