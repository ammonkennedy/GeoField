import { useSearch } from "wouter";
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
import { StereonetPlot } from "@/components/StereonetPlot";
import {
  loadStereonets,
  saveStereonet,
  STEREONETS_UPDATED,
} from "@/lib/stereonet/storage";
import {
  newStereonet,
  plottedMeasurements,
  type Stereonet,
  type North,
} from "@/lib/stereonet/model";
import { exportStereonet } from "@/lib/stereonet/export";
import { getStorageAccountId } from "@/lib/storage-account";
import {
  loadMeasurements,
  STRIKE_DIP_UPDATED_EVENT,
  type StrikeDipMeasurement,
} from "@/lib/strike-dip-measurements";
const input =
  "w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm";
const panel = "rounded-xl border bg-card p-4 space-y-3";
export default function StereonetsPage() {
  const { data: cloudDatasets } = useGetFolders();
  const [localDatasets, setLocalDatasets] = useState(getLocalDatasets);
  const [datasetSelection, setDatasetSelection] = useState<DatasetSelection>(
    [],
  );
  const requestedNet = new URLSearchParams(useSearch()).get("net");
  const openedLink = useRef<string | null>(null);
  const account = useRef(getStorageAccountId());
  const savedBase = useRef<Stereonet | null>(null);
  const [nets, setNets] = useState<Stereonet[]>([]),
    [net, setNet] = useState<Stereonet | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [existing, setExisting] = useState<StrikeDipMeasurement[]>([]);
  const [feature, setFeature] = useState("");
  const [busy, setBusy] = useState(false);
  const [dataNetId, setDataNetId] = useState<string | null>(null);
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
      const base = net ?? newStereonet("Measurement projects");
      const next = importMeasurementDatasets(
        base,
        existing,
        sourceDatasets,
        localDatasets,
        datasetSelection,
      );
      const selectedProjects = sourceOptions.filter((option) =>
        datasetSelected(datasetSelection, option.id, localDatasets),
      );
      if (!next.savedDatasetId && selectedProjects.length === 1)
        next.savedDatasetId = selectedProjects[0].id;
      if (commit(next)) {
        setFeature("");
      }
    } catch (e) {
      setError(`No projects were imported. ${(e as Error).message}`);
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
          JSON.stringify(current) === JSON.stringify(savedBase.current)
        ) {
          savedBase.current = latest ?? null;
          return latest ?? null;
        }
        return current;
      });
      setLocalDatasets(getLocalDatasets());
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
    if (!requestedNet) {
      openedLink.current = null;
      return;
    }
    if (openedLink.current === requestedNet) return;
    const linked = nets.find((net) => net.id === requestedNet);
    if (linked) {
      if (open(linked)) openedLink.current = requestedNet;
    }
  }, [requestedNet, nets]);
  function commit(next: Stereonet) {
    setNet(next);
    setError("");
    setMessage("Temporary — click Save to project to keep changes.");
    return true;
  }
  function persist(next: Stereonet) {
    try {
      const saved = saveStereonet(next, account.current);
      savedBase.current = saved;
      setNet(saved);
      setError("");
      setMessage("Saved on this device");

      return true;
    } catch (e) {
      setNet(next);
      setError((e as Error).message);
      setMessage("Not saved — keep this page open and retry.");
      return false;
    }
  }
  function preserveDraft() {
    if (!net || JSON.stringify(net) === JSON.stringify(savedBase.current))
      return true;
    return window.confirm("Discard the temporary stereonet changes and continue?");
  }
  function open(next: Stereonet) {
    if (!preserveDraft()) return false;
    savedBase.current = next;
    setNet(next);

    setFeature("");

    setError("");
    setMessage("");
    setDataNetId(null);
    return true;
  }
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (net && JSON.stringify(net) !== JSON.stringify(savedBase.current)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [net]);
  const plotted = useMemo(
    () => (net ? plottedMeasurements(net, feature) : { items: [], errors: [] }),
    [net, feature],
  );
  async function download(format: "png" | "pdf" | "csv") {
    if (!net || !svgRef.current) return;
    setBusy(true);
    try {
      await exportStereonet(net, svgRef.current, format);
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
              if (!preserveDraft()) return;
              savedBase.current = null;
              commit(newStereonet("Untitled stereonet"));
            }}
          >
            New stereonet
          </Button>
        </div>
        <div className={panel}>
          <h2 className="font-semibold">Plot measurement projects</h2>
          <DatasetMultiSelect
            options={sourceOptions}
            identities={localDatasets}
            value={datasetSelection}
            onChange={setDatasetSelection}
          />
          <Button disabled={!selectedCount} onClick={plotDatasets}>
            Plot selected projects
          </Button>
          {net && (
            <>
              <label className="block text-sm">
                Name
                <input
                  className={input}
                  value={net.name}
                  onChange={(e) => commit({ ...net, name: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Project
                <select
                  className={input}
                  value={net.savedDatasetId ?? ""}
                  onChange={(e) => commit({ ...net, savedDatasetId: e.target.value || undefined })}
                >
                  <option value="">Select a project</option>
                  {datasetOptions(sourceDatasets, localDatasets, [net.savedDatasetId]).filter((project) => project.id).map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}
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
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  aria-expanded={dataNetId === net.id}
                  aria-controls="stereonet-measurement-data"
                  onClick={() => setDataNetId(dataNetId === net.id ? null : net.id)}
                >
                  {dataNetId === net.id ? "Hide data" : "Display data"}
                </Button>
                <Button size="sm" variant="outline" disabled={!net.savedDatasetId} onClick={() => persist(net)}>
                  Save to project
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete stereonet “${net.name}”? Original GeoField measurements will remain.`,
                      ) &&
                      (!savedBase.current || persist({ ...net, deletedAt: new Date().toISOString() }))
                    )
                      setNet(null);
                  }}
                >
                  Delete stereonet
                </Button>
              </div>
              <p role="status" className="text-xs text-muted-foreground">
                {message}
              </p>
              <StereonetPlot net={net} items={plotted.items} svgRef={svgRef} />
              <div className="grid grid-cols-3 gap-2">
                {(["png", "pdf", "csv"] as const).map((f) => (
                  <Button
                    key={f}
                    variant="outline"
                    className="min-w-0 px-1 text-xs sm:px-4 sm:text-sm"
                    disabled={busy}
                    onClick={() => download(f)}
                  >
                    Export {f.toUpperCase()}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Figure exports use the full net
                and visible data; CSV includes all measurements and original
                metadata.
              </p>
              {dataNetId === net.id && (
                <section id="stereonet-measurement-data" className="space-y-3">
                  <h2 className="font-semibold">Measurement data ({net.measurements.length})</h2>
                  {net.measurements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No measurements in this stereonet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b">
                            {["Name", "Strike / Azimuth", "Dip / Plunge"].map((heading) => (
                              <th key={heading} scope="col" className="p-2 whitespace-nowrap font-medium">{heading}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {net.measurements.map((measurement) => (
                            <tr key={measurement.id} className="border-b align-top">
                              <td className="p-2">{measurement.name || "Unnamed measurement"}</td>
                              <td className="p-2">
                                {measurement.kind === "plane" ? "Strike" : "Azimuth"} {measurement.azimuth}°
                              </td>
                              <td className="p-2">
                                {measurement.kind === "plane" ? "Dip" : "Plunge"} {measurement.inclination}°
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
