import { DatasetSection } from "./DatasetSection";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { loadStereonets, STEREONETS_UPDATED } from "@/lib/stereonet/storage";
import { stereonetInDataset } from "@/lib/stereonet/dataset-association";
import type { Stereonet } from "@/lib/stereonet/model";
import type { LocalDataset } from "@/lib/local-datasets";

export function DatasetStereonets({
  datasetId,
  localDatasets,
}: {
  datasetId: string | number;
  localDatasets: LocalDataset[];
}) {
  const [nets, setNets] = useState<Stereonet[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => {
      try {
        setNets(loadStereonets());
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load stereonets.");
      }
    };
    refresh();
    window.addEventListener(STEREONETS_UPDATED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STEREONETS_UPDATED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const selected = nets
    .filter((net) => stereonetInDataset(net, datasetId, localDatasets))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <DatasetSection title="Stereonets">
      {error && (
        <p role="alert" className="px-5 pt-4 text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-3 p-5">
        {!error && !selected.length && (
          <p className="text-sm text-muted-foreground">
            No stereonets associated with this project yet.
          </p>
        )}
        {selected.map((net) => (
          <Link
            key={net.id}
            href={`/stereonets?net=${encodeURIComponent(net.id)}`}
            className="block rounded-xl border p-4 hover:bg-muted/50"
          >
            <h3 className="font-semibold text-primary">{net.name}</h3>
            <p className="text-sm text-muted-foreground">
              {net.measurements.length} measurement
              {net.measurements.length === 1 ? "" : "s"} · Updated{" "}
              {new Date(net.updatedAt).toLocaleDateString()}
            </p>
            <span className="mt-2 inline-block text-sm text-primary">
              View stereonet
            </span>
          </Link>
        ))}
      </div>
    </DatasetSection>
  );
}
