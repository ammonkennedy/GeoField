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
import { loadTrips, type Trip } from "@/lib/trips";
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
  const [trips, setTrips] = useState<Trip[]>([]),
    [existing, setExisting] = useState<StrikeDipMeasurement[]>([]);
  const [feature, setFeature] = useState("");
  const [busy, setBusy] = useState(false);
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
    if (!requestedNet) {
      openedLink.current = null;
      return;
    }
    if (openedLink.current === requestedNet) return;
    const linked = nets.find((net) => net.id === requestedNet);
    if (linked) {
      open(linked);
      openedLink.current = requestedNet;
    }
  }, [requestedNet, nets]);
  function commit(next: Stereonet) {
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
  function open(next: Stereonet) {
    savedBase.current = next;
    setNet(next);

    setFeature("");

    setError("");
    setMessage("");
  }
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
              const n = newStereonet("Untitled stereonet");
              if (commit(n)) {
              }
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
          <p className="text-sm text-muted-foreground">
            {selectedCount} measurements selected. Each project keeps its name
            and receives its own color. Imports are saved snapshots.
          </p>
          <Button disabled={!selectedCount} onClick={plotDatasets}>
            Plot selected projects
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
                Trip
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
              <StereonetPlot net={net} items={plotted.items} svgRef={svgRef} />
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
                Pinch to zoom; drag when zoomed. Figure exports use the full net
                and visible data; CSV includes all measurements and original
                metadata.
              </p>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
