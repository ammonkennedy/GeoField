import { useGetFolders } from "@workspace/api-client-react";
import { DatasetMultiSelect } from "@/components/DatasetMultiSelect";
import {
  datasetOptions,
  datasetSelected,
  type DatasetSelection,
} from "@/lib/dataset-selection";
import {
  getLocalDatasets,
  getVisibleLocalDatasets,
  LOCAL_DATASETS_UPDATED_EVENT,
} from "@/lib/local-datasets";
import {
  compatibleReference,
  importMeasurementDatasets,
} from "@/lib/stereonet/dataset-import";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { StereonetPlot, type NetAnalysis } from "@/components/StereonetPlot";
import {
  loadStereonets,
  saveStereonet,
  STEREONETS_UPDATED,
} from "@/lib/stereonet/storage";
import {
  newStereonet,
  newGroup,
  plottedMeasurements,
  importMeasurement,
  measurementVector,
  type Stereonet,
  type NetMeasurement,
  type North,
} from "@/lib/stereonet/model";
import {
  axialMean,
  directionalMean,
  girdle,
  intersection,
  planeFromPole,
  line,
  wrap,
} from "@/lib/stereonet/math";
import { exportStereonet } from "@/lib/stereonet/export";
import { getStorageAccountId } from "@/lib/storage-account";
import {
  loadMeasurements,
  STRIKE_DIP_UPDATED_EVENT,
  type StrikeDipMeasurement,
} from "@/lib/strike-dip-measurements";
import { loadTrips, type Trip } from "@/lib/trips";
const input =
  "w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm";
const panel = "rounded-xl border bg-card p-4 space-y-3";
const features = {
  plane: ["bedding", "joint", "fault", "cleavage", "foliation", "other"],
  line: [
    "fold axis",
    "lineation",
    "intersection lineation",
    "slickenline",
    "other",
  ],
};
type Draft = {
  id?: string;
  kind: "plane" | "line";
  notation: "rhr" | "dip-direction" | "strike-side";
  azimuth: string;
  inclination: string;
  dipDirection: string;
  name: string;
  feature: string;
  notes: string;
  north: North | "unknown";
  declination: string;
  groupId: string;
};
const draftFor = (groupId: string): Draft => ({
  kind: "plane",
  notation: "rhr",
  azimuth: "",
  inclination: "",
  dipDirection: "",
  name: "",
  feature: "bedding",
  notes: "",
  north: "magnetic",
  declination: "",
  groupId,
});
export default function StereonetsPage() {
  const { data: cloudDatasets } = useGetFolders();
  const [localDatasets, setLocalDatasets] = useState(getLocalDatasets);
  const [datasetSelection, setDatasetSelection] = useState<DatasetSelection>(
    [],
  );
  const account = useRef(getStorageAccountId());
  const savedBase = useRef<Stereonet | null>(null);
  const [nets, setNets] = useState<Stereonet[]>([]),
    [net, setNet] = useState<Stereonet | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]),
    [existing, setExisting] = useState<StrikeDipMeasurement[]>([]);
  const [tab, setTab] = useState("Plot"),
    [feature, setFeature] = useState(""),
    [draft, setDraft] = useState<Draft>(draftFor(""));
  const [imports, setImports] = useState<string[]>([]),
    [analysisGroup, setAnalysisGroup] = useState(""),
    [analysis, setAnalysis] = useState<NetAnalysis>(),
    [analysisText, setAnalysisText] = useState(""),
    [pair, setPair] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const sourceDatasets = [
    ...(cloudDatasets ?? []),
    ...getVisibleLocalDatasets(localDatasets, cloudDatasets),
  ];
  const sourceOptions = datasetOptions(
    sourceDatasets,
    localDatasets,
    existing.map((m) => m.datasetId),
  ).filter((o) => o.count > 0);
  const selectedCount = existing.filter((m) =>
    datasetSelected(datasetSelection, m.datasetId, localDatasets),
  ).length;
  function plotDatasets() {
    try {
      const base = net ?? newStereonet("Measurement datasets");
      const next = importMeasurementDatasets(
        base,
        existing,
        sourceDatasets,
        localDatasets,
        datasetSelection,
      );
      if (commit(next)) {
        setDraft(draftFor(next.groups[0].id));
        setAnalysisGroup(next.groups[0].id);
        setFeature("");
        setTab("Plot");
      }
    } catch (e) {
      setError(`No datasets were imported. ${(e as Error).message}`);
    }
  }

  function refresh() {
    try {
      const saved = loadStereonets();
      setNets(saved);
      setNet((current) => {
        const latest = saved.find((n) => n.id === current?.id);
        if (
          current &&
          latest &&
          JSON.stringify(current) === JSON.stringify(savedBase.current)
        ) {
          savedBase.current = latest;
          return latest;
        }
        return current;
      });
      setLocalDatasets(getLocalDatasets());
      setTrips(loadTrips());
      setExisting(loadMeasurements());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refresh);
    window.addEventListener(STEREONETS_UPDATED, refresh);
    window.addEventListener(STRIKE_DIP_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refresh);
      window.removeEventListener(STEREONETS_UPDATED, refresh);
      window.removeEventListener(STRIKE_DIP_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  useEffect(() => {
    setAnalysis(undefined);
    setAnalysisText("");
  }, [net?.localRevision, net?.cloudRevision]);
  function commit(next: Stereonet) {
    try {
      const saved = saveStereonet(next, account.current);
      savedBase.current = saved;
      setNet(saved);
      setError("");
      setMessage("Saved on this device");
      setAnalysis(undefined);
      setAnalysisText("");
      return true;
    } catch (e) {
      setNet(next);
      setError((e as Error).message);
      setMessage("Not saved — keep this page open and retry.");
      return false;
    }
  }
  function open(next: Stereonet) {
    savedBase.current = next;
    setNet(next);
    setDraft(draftFor(next.groups[0]?.id ?? ""));
    setFeature("");
    setAnalysisGroup(next.groups[0]?.id ?? "");
    setAnalysis(undefined);
    setAnalysisText("");
    setPair([]);
    setImports([]);
    setError("");
    setMessage("");
  }
  function edit(m: NetMeasurement) {
    setDraft({
      id: m.id,
      kind: m.kind,
      notation: "rhr",
      azimuth: String(m.azimuth),
      inclination: String(m.inclination),
      dipDirection: "",
      name: m.name,
      feature: m.feature,
      notes: m.notes,
      north: m.north,
      declination: m.declination === undefined ? "" : String(m.declination),
      groupId: m.groupId,
    });
    setTab("Measurements");
  }
  const plotted = useMemo(
    () => (net ? plottedMeasurements(net, feature) : { items: [], errors: [] }),
    [net, feature],
  );
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!net) return;
    try {
      const az = Number(draft.azimuth),
        inc = Number(draft.inclination),
        dd = Number(draft.dipDirection);
      if (
        !draft.azimuth.trim() ||
        !draft.inclination.trim() ||
        !Number.isFinite(az) ||
        az < 0 ||
        az >= 360 ||
        !Number.isFinite(inc) ||
        inc < 0 ||
        inc > 90
      )
        throw new Error("Azimuth must be 0–359.999° and dip/plunge 0–90°.");
      let strike = az;
      if (draft.kind === "plane" && draft.notation === "dip-direction")
        strike = wrap(az - 90);
      if (draft.kind === "plane" && draft.notation === "strike-side") {
        if (
          !draft.dipDirection.trim() ||
          !Number.isFinite(dd) ||
          dd < 0 ||
          dd >= 360 ||
          Math.abs(Math.abs(((dd - az + 540) % 360) - 180) - 90) > 0.1
        )
          throw new Error(
            "Dip direction must be perpendicular to strike (±0.1°).",
          );
        strike = wrap(dd - 90);
      }
      const declination = draft.declination.trim()
        ? Number(draft.declination)
        : undefined;
      if (
        declination !== undefined &&
        (!Number.isFinite(declination) || Math.abs(declination) > 180)
      )
        throw new Error(
          "Declination must be between −180 and 180°, east positive.",
        );
      const previous = net.measurements.find((m) => m.id === draft.id);
      const measurement: NetMeasurement = {
        id: previous?.id ?? crypto.randomUUID(),
        kind: draft.kind,
        groupId: draft.groupId,
        name: draft.name,
        feature: draft.feature,
        notes: draft.notes,
        azimuth: wrap(strike),
        inclination: inc,
        north: draft.north,
        declination,
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        sourceId: previous?.sourceId,
        raw: previous
          ? {
              ...previous.raw,
              edits: [
                ...((previous.raw.edits as unknown[]) ?? []),
                { ...draft, at: new Date().toISOString() },
              ],
            }
          : { ...draft },
      };
      if (!net.groups.some((g) => g.id === measurement.groupId))
        throw new Error("Choose a dataset.");
      if (
        commit({
          ...net,
          measurements: [
            ...net.measurements.filter((m) => m.id !== measurement.id),
            measurement,
          ],
        })
      )
        setDraft(draftFor(draft.groupId));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function runAnalysis(
    mode: "mean" | "directional" | "girdle" | "intersection",
  ) {
    if (!net) return;
    setAnalysis(undefined);
    setAnalysisText("");
    try {
      if (plotted.errors.length)
        throw new Error("Resolve north-reference warnings before analysis.");
      const selected = plotted.items.filter((m) => m.groupId === analysisGroup);
      let result: NetAnalysis;
      if (mode === "intersection") {
        const planes = plotted.items.filter(
          (m) => pair.includes(m.id) && m.kind === "plane",
        );
        if (planes.length !== 2)
          throw new Error("Select exactly two visible planes.");
        result = {
          label: "Plane intersection",
          ...intersection(
            measurementVector(planes[0]),
            measurementVector(planes[1]),
          ),
        };
      } else if (mode === "girdle") {
        const bedding = selected.filter(
          (m) => m.kind === "plane" && m.feature.toLowerCase() === "bedding",
        );
        result = {
          label: "Best-fit bedding girdle pole (possible fold axis)",
          ...girdle(bedding.map(measurementVector)),
        };
      } else {
        if (!selected.length || new Set(selected.map((m) => m.kind)).size !== 1)
          throw new Error(
            "Choose a dataset containing only planes or only lines.",
          );
        if (mode === "directional" && selected[0].kind !== "line")
          throw new Error("Directional means apply only to lines.");
        const values = selected.map(measurementVector);
        result = {
          label:
            mode === "directional"
              ? "Directional mean line"
              : selected[0].kind === "plane"
                ? "Axial mean pole"
                : "Axial mean line",
          ...(mode === "directional"
            ? directionalMean(values)
            : axialMean(values)),
        };
        if (selected[0].kind === "plane" && mode === "mean")
          Object.assign(
            result,
            planeFromPole(line(result.trend, result.plunge)),
          );
      }
      const text = `${result.label}: trend ${result.trend.toFixed(1)}°, plunge ${result.plunge.toFixed(1)}° (${net.north} north).${result.strike !== undefined ? ` Plane RHR strike ${result.strike.toFixed(1)}°, dip ${result.dip!.toFixed(1)}°.` : ""}${mode === "girdle" ? " A fold interpretation requires a bedding girdle and supporting geological evidence." : ""}`;
      setAnalysis(result);
      setAnalysisText(text);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function download(format: "png" | "pdf" | "csv") {
    if (!net || !svgRef.current) return;
    setBusy(true);
    try {
      await exportStereonet(net, svgRef.current, format, analysisText);
      setError("");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-4 pb-8 min-w-0">
        <h1 className="text-3xl font-bold">Stereonets</h1>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Saved stereonet"
            className={input + " flex-1"}
            value={net?.id ?? ""}
            onChange={(e) => {
              const n = nets.find((n) => n.id === e.target.value);
              if (n) open(n);
            }}
          >
            <option value="">Open a stereonet…</option>
            {nets.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <Button
            onClick={() => {
              const n = newStereonet("Untitled stereonet");
              if (commit(n)) {
                setDraft(draftFor(n.groups[0].id));
                setAnalysisGroup(n.groups[0].id);
                setTab("Plot");
              }
            }}
          >
            New stereonet
          </Button>
        </div>
        <div className={panel}>
          <h2 className="font-semibold">Plot measurement datasets</h2>
          <DatasetMultiSelect
            options={sourceOptions}
            identities={localDatasets}
            value={datasetSelection}
            onChange={setDatasetSelection}
          />
          <p className="text-sm text-muted-foreground">
            {selectedCount} measurements selected. Each dataset keeps its name
            and receives its own color. Imports are editable snapshots.
          </p>
          <Button disabled={!selectedCount} onClick={plotDatasets}>
            Plot selected datasets
          </Button>
          {!sourceOptions.length && (
            <p className="text-sm text-muted-foreground">
              No saved structural measurements are available yet. Synced
              measurements and measurements saved offline appear here.
            </p>
          )}
        </div>
        {!net ? (
          <p className="text-muted-foreground">
            Create a stereonet or open one saved to your account.
          </p>
        ) : (
          <>
            <div className={panel}>
              <label className="block text-sm">
                Name
                <input
                  className={input}
                  value={net.name}
                  onChange={(e) => setNet({ ...net, name: e.target.value })}
                  onBlur={() => commit(net)}
                />
              </label>
              <label className="block text-sm">
                Project / trip
                <select
                  className={input}
                  value={net.projectId ?? ""}
                  onChange={(e) =>
                    commit({ ...net, projectId: e.target.value || undefined })
                  }
                >
                  <option value="">Unassigned</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => commit(net)}>
                  Save
                </Button>
                <span role="status" className="text-xs text-muted-foreground">
                  {message}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete stereonet “${net.name}”? Original GeoField measurements will remain.`,
                      ) &&
                      commit({ ...net, deletedAt: new Date().toISOString() })
                    )
                      setNet(null);
                  }}
                >
                  Delete stereonet
                </Button>
              </div>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="tablist"
              aria-label="Stereonet panels"
            >
              {["Plot", "Measurements", "Datasets", "Import", "Analysis"].map(
                (t) => (
                  <Button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    variant={tab === t ? "default" : "outline"}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </Button>
                ),
              )}
            </div>
            <div
              className={
                tab === "Plot" || tab === "Analysis" ? panel : "hidden"
              }
            >
              <div className="flex flex-wrap gap-3">
                <label className="text-sm">
                  Planes
                  <select
                    aria-label="Plane display"
                    className={input}
                    value={net.display}
                    onChange={(e) =>
                      commit({
                        ...net,
                        display: e.target.value as Stereonet["display"],
                      })
                    }
                  >
                    <option value="both">Great circles and poles</option>
                    <option value="poles">Poles</option>
                    <option value="planes">Great circles</option>
                  </select>
                </label>
                <label className="text-sm">
                  Plot reference
                  <select
                    className={input}
                    value={net.north}
                    onChange={(e) =>
                      commit({ ...net, north: e.target.value as North })
                    }
                  >
                    <option value="magnetic">Magnetic north</option>
                    <option value="true">True north</option>
                  </select>
                </label>
                <label className="text-sm">
                  Feature
                  <select
                    className={input}
                    value={feature}
                    onChange={(e) => {
                      setFeature(e.target.value);
                      setAnalysis(undefined);
                      setAnalysisText("");
                    }}
                  >
                    <option value="">All features</option>
                    {[...new Set(net.measurements.map((m) => m.feature))].map(
                      (f) => (
                        <option key={f}>{f}</option>
                      ),
                    )}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={net.grid}
                    onChange={(e) => commit({ ...net, grid: e.target.checked })}
                  />
                  Show grid
                </label>
              </div>
              {plotted.errors.length > 0 && (
                <div role="alert" className="text-sm text-amber-800">
                  {plotted.errors.length} measurement(s) excluded:{" "}
                  {plotted.errors.slice(0, 3).join(" ")}
                  {compatibleReference(net) !== net.north && (
                    <Button
                      className="mt-2"
                      variant="outline"
                      onClick={() =>
                        commit({ ...net, north: compatibleReference(net) })
                      }
                    >
                      Use {compatibleReference(net)} north
                    </Button>
                  )}
                </div>
              )}
              <StereonetPlot
                net={net}
                items={plotted.items}
                analysis={analysis}
                onSelect={(id) => {
                  const m = net.measurements.find((m) => m.id === id);
                  if (m) edit(m);
                }}
                svgRef={svgRef}
              />
              <div className="flex flex-wrap gap-2">
                {(["png", "pdf", "csv"] as const).map((f) => (
                  <Button
                    key={f}
                    variant="outline"
                    disabled={busy}
                    onClick={() => download(f)}
                  >
                    Export {f.toUpperCase()}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Pinch to zoom; drag when zoomed. Tap a measurement to edit.
                Figure exports use the full net and visible data; CSV includes
                all measurements and original metadata.
              </p>
            </div>
            {tab === "Measurements" && (
              <div className={panel}>
                <h2 className="font-semibold">
                  {draft.id ? "Edit measurement" : "Add measurement"}
                </h2>
                <form
                  onSubmit={submit}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <label className="text-sm">
                    Type
                    <select
                      className={input}
                      value={draft.kind}
                      onChange={(e) => {
                        const kind = e.target.value as Draft["kind"];
                        setDraft({
                          ...draft,
                          kind,
                          feature: features[kind][0],
                        });
                      }}
                    >
                      <option value="plane">Plane</option>
                      <option value="line">Line</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Dataset
                    <select
                      className={input}
                      value={draft.groupId}
                      onChange={(e) =>
                        setDraft({ ...draft, groupId: e.target.value })
                      }
                    >
                      {net.groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draft.kind === "plane" && (
                    <label className="text-sm">
                      Notation
                      <select
                        className={input}
                        value={draft.notation}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            notation: e.target.value as Draft["notation"],
                          })
                        }
                      >
                        <option value="rhr">
                          Strike / dip — Right-Hand Rule
                        </option>
                        <option value="dip-direction">
                          Dip direction / dip
                        </option>
                        <option value="strike-side">
                          Strike / dip with explicit dip direction
                        </option>
                      </select>
                    </label>
                  )}
                  <label className="text-sm">
                    {draft.kind === "line"
                      ? "Trend / azimuth"
                      : draft.notation === "dip-direction"
                        ? "Dip direction"
                        : "Strike"}{" "}
                    (°)
                    <input
                      className={input}
                      type="number"
                      step="any"
                      min="0"
                      max="359.999"
                      required
                      value={draft.azimuth}
                      onChange={(e) =>
                        setDraft({ ...draft, azimuth: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    {draft.kind === "line" ? "Plunge" : "Dip"} (°)
                    <input
                      className={input}
                      type="number"
                      step="any"
                      min="0"
                      max="90"
                      required
                      value={draft.inclination}
                      onChange={(e) =>
                        setDraft({ ...draft, inclination: e.target.value })
                      }
                    />
                  </label>
                  {draft.kind === "plane" &&
                    draft.notation === "strike-side" && (
                      <label className="text-sm">
                        Dip direction (°)
                        <input
                          className={input}
                          type="number"
                          step="any"
                          required
                          value={draft.dipDirection}
                          onChange={(e) =>
                            setDraft({ ...draft, dipDirection: e.target.value })
                          }
                        />
                      </label>
                    )}
                  <label className="text-sm">
                    Feature
                    <select
                      className={input}
                      value={draft.feature}
                      onChange={(e) =>
                        setDraft({ ...draft, feature: e.target.value })
                      }
                    >
                      {[
                        ...new Set([...features[draft.kind], draft.feature]),
                      ].map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Name
                    <input
                      className={input}
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Original north reference
                    <select
                      className={input}
                      value={draft.north}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          north: e.target.value as Draft["north"],
                        })
                      }
                    >
                      <option value="magnetic">Magnetic</option>
                      <option value="true">True</option>
                      {draft.north === "unknown" && (
                        <option value="unknown">Unknown — needs review</option>
                      )}
                    </select>
                  </label>
                  <label className="text-sm">
                    Declination (° east positive, optional)
                    <input
                      className={input}
                      type="number"
                      min="-180"
                      max="180"
                      step="any"
                      value={draft.declination}
                      onChange={(e) =>
                        setDraft({ ...draft, declination: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    Description / notes
                    <textarea
                      className={input}
                      value={draft.notes}
                      onChange={(e) =>
                        setDraft({ ...draft, notes: e.target.value })
                      }
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button type="submit">
                      {draft.id ? "Save measurement" : "Add measurement"}
                    </Button>
                    {draft.id && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDraft(draftFor(draft.groupId))}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        {[
                          "Name",
                          "Dataset",
                          "Feature",
                          "Type",
                          "Strike / trend",
                          "Dip / plunge",
                          "North",
                          "Actions",
                        ].map((h) => (
                          <th className="p-2 text-left" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {net.measurements.map((m) => (
                        <tr key={m.id} className="border-t">
                          <td className="p-2">{m.name || "Unnamed"}</td>
                          <td>
                            {net.groups.find((g) => g.id === m.groupId)?.name}
                          </td>
                          <td>{m.feature}</td>
                          <td>{m.kind}</td>
                          <td>{m.azimuth}°</td>
                          <td>{m.inclination}°</td>
                          <td>{m.north}</td>
                          <td className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => edit(m)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Remove this measurement from the stereonet?",
                                  )
                                )
                                  commit({
                                    ...net,
                                    measurements: net.measurements.filter(
                                      (x) => x.id !== m.id,
                                    ),
                                  });
                              }}
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {tab === "Datasets" && (
              <div className={panel}>
                <p className="text-sm text-muted-foreground">
                  Declination is east positive and applies only when converting
                  north references. Individual measurement values take priority.
                </p>
                {net.groups.map((g) => (
                  <div
                    key={g.id}
                    className="border rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
                  >
                    <label className="text-sm">
                      Dataset name
                      <input
                        className={input}
                        defaultValue={g.name}
                        key={g.name}
                        onBlur={(e) =>
                          commit({
                            ...net,
                            groups: net.groups.map((x) =>
                              x.id === g.id
                                ? { ...x, name: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={g.visible}
                        onChange={(e) =>
                          commit({
                            ...net,
                            groups: net.groups.map((x) =>
                              x.id === g.id
                                ? { ...x, visible: e.target.checked }
                                : x,
                            ),
                          })
                        }
                      />
                      Show dataset
                      <input
                        aria-label={`${g.name} color`}
                        type="color"
                        value={g.color}
                        onChange={(e) =>
                          commit({
                            ...net,
                            groups: net.groups.map((x) =>
                              x.id === g.id
                                ? { ...x, color: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Point symbol
                      <select
                        className={input}
                        value={g.symbol}
                        onChange={(e) =>
                          commit({
                            ...net,
                            groups: net.groups.map((x) =>
                              x.id === g.id
                                ? {
                                    ...x,
                                    symbol: e.target.value as typeof g.symbol,
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        {["circle", "square", "triangle"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Dataset declination (° east positive)
                      <input
                        className={input}
                        type="number"
                        step="any"
                        defaultValue={g.declination ?? ""}
                        onBlur={(e) => {
                          const value =
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value);
                          if (
                            value !== undefined &&
                            (!Number.isFinite(value) || Math.abs(value) > 180)
                          ) {
                            setError(
                              "Declination must be between −180 and 180°.",
                            );
                            return;
                          }
                          commit({
                            ...net,
                            groups: net.groups.map((x) =>
                              x.id === g.id ? { ...x, declination: value } : x,
                            ),
                          });
                        }}
                      />
                    </label>
                    <label className="text-sm">
                      Assume reference for unknown imports
                      <select
                        className={input}
                        value={g.assumedNorth ?? ""}
                        onChange={(e) =>
                          commit({
                            ...net,
                            groups: net.groups.map((x) =>
                              x.id === g.id
                                ? {
                                    ...x,
                                    assumedNorth: (e.target.value ||
                                      undefined) as North | undefined,
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="">Do not assume</option>
                        <option value="magnetic">Magnetic</option>
                        <option value="true">True</option>
                      </select>
                    </label>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    commit({
                      ...net,
                      groups: [
                        ...net.groups,
                        newGroup(`Dataset ${net.groups.length + 1}`),
                      ],
                    })
                  }
                >
                  Add dataset
                </Button>
              </div>
            )}
            {tab === "Import" && (
              <div className={panel}>
                <p className="text-sm">
                  Import a snapshot of existing measurements. Editing this
                  stereonet leaves the original records unchanged.
                </p>
                <label className="text-sm">
                  Destination dataset
                  <select
                    className={input}
                    value={draft.groupId}
                    onChange={(e) =>
                      setDraft({ ...draft, groupId: e.target.value })
                    }
                  >
                    {net.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      existing.length > 0 && imports.length === existing.length
                    }
                    onChange={(e) =>
                      setImports(
                        e.target.checked ? existing.map((m) => m.id) : [],
                      )
                    }
                  />
                  Select all
                </label>
                <div className="max-h-80 overflow-auto space-y-2">
                  {existing.map((m) => (
                    <label key={m.id} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={imports.includes(m.id)}
                        onChange={(e) =>
                          setImports(
                            e.target.checked
                              ? [...imports, m.id]
                              : imports.filter((id) => id !== m.id),
                          )
                        }
                      />
                      {m.label || m.featureType || "Measurement"} ·{" "}
                      {m.measurementType === "lineation"
                        ? `${m.trendDegrees}/${m.plungeDegrees}`
                        : `${m.strike}/${m.dip}`}{" "}
                      ·{" "}
                      {m.northReference ?? m.referenceFrame ?? "unknown north"}
                    </label>
                  ))}
                </div>
                <Button
                  disabled={!imports.length}
                  onClick={() => {
                    try {
                      const additions = existing
                        .filter(
                          (m) =>
                            imports.includes(m.id) &&
                            !net.measurements.some(
                              (n) =>
                                n.sourceId === m.id &&
                                n.groupId === draft.groupId,
                            ),
                        )
                        .map((m) => importMeasurement(m, draft.groupId));
                      if (
                        commit(
                          (() => {
                            const next = {
                              ...net,
                              measurements: [...net.measurements, ...additions],
                            };
                            return {
                              ...next,
                              north: compatibleReference(next),
                            };
                          })(),
                        )
                      ) {
                        setImports([]);
                        setTab("Plot");
                        setMessage(
                          `Imported ${additions.length} measurements and saved locally.`,
                        );
                      }
                    } catch (e) {
                      setError(
                        `Import stopped; no records were changed. ${(e as Error).message}`,
                      );
                    }
                  }}
                >
                  Import selected
                </Button>
              </div>
            )}
            {tab === "Analysis" && (
              <div className={panel}>
                <h2 className="font-semibold">Structural analysis</h2>
                <label className="text-sm">
                  Analysis dataset
                  <select
                    className={input}
                    value={analysisGroup}
                    onChange={(e) => {
                      setAnalysisGroup(e.target.value);
                      setAnalysis(undefined);
                      setAnalysisText("");
                    }}
                  >
                    {net.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-sm text-muted-foreground">
                  Uses visible measurements and the feature filter. Poles and
                  axial lines use an orientation tensor; directional lines use a
                  vector mean. Choose a geologically coherent dataset.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => runAnalysis("mean")}>
                    Axial mean
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => runAnalysis("directional")}
                  >
                    Directional line mean
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => runAnalysis("girdle")}
                  >
                    Fit bedding girdle
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      commit({ ...net, display: "poles" });
                      setTab("Plot");
                    }}
                  >
                    Inspect pole clusters
                  </Button>
                </div>
                <h3 className="font-medium">Plane intersection</h3>
                <div className="max-h-40 overflow-auto">
                  {plotted.items
                    .filter((m) => m.kind === "plane")
                    .map((m) => (
                      <label key={m.id} className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={pair.includes(m.id)}
                          onChange={(e) =>
                            setPair(
                              e.target.checked
                                ? [...pair, m.id]
                                : pair.filter((id) => id !== m.id),
                            )
                          }
                        />
                        {m.name || m.feature} · {m.azimuth}/{m.inclination}
                      </label>
                    ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => runAnalysis("intersection")}
                >
                  Calculate intersection
                </Button>
                {analysisText && (
                  <p role="status" className="text-sm">
                    {analysisText}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  A red ring marks the result; a dashed red line marks the
                  fitted or mean plane. Estimates are not confidence regions or
                  stress solutions.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
