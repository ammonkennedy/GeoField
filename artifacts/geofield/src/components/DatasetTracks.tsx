import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { loadTracks, updateTrack, TRACKS_UPDATED } from '@/lib/tracks';
import { trackStats } from '@/lib/track-math';
import { resolveDatasetId } from '@/lib/dataset-identity';
import type { LocalDataset } from '@/lib/local-datasets';

export function DatasetTracks({ datasetId, localDatasets }: { datasetId: string | number; localDatasets: LocalDataset[] }) {
  const [tracks, setTracks] = useState(() => loadTracks());
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => setTracks(loadTracks());
    window.addEventListener(TRACKS_UPDATED, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(TRACKS_UPDATED, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const selected = tracks.filter(track => String(resolveDatasetId(track.datasetId, localDatasets) ?? '') === String(resolveDatasetId(datasetId, localDatasets))).reverse();
  return <section className="mt-8 rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="dataset-tracks-title">
    <h2 id="dataset-tracks-title" className="border-b px-5 py-4 text-lg font-semibold">Tracks</h2>
    {error && <p role="alert" className="px-5 pt-4 text-destructive">{error}</p>}
    <div className="space-y-3 p-5">
      {!selected.length && <p className="text-sm text-muted-foreground">No tracks assigned to this dataset yet.</p>}
      {selected.map(track => {
        const stats = trackStats(track.points);
        return <Link key={track.id} href={`/map?track=${encodeURIComponent(track.id)}`} onClick={event => {
          try { updateTrack(track.id, { visible: true }); }
          catch (e) { event.preventDefault(); setError(e instanceof Error ? e.message : 'Unable to open track.'); }
        }} className="block rounded-xl border p-4 hover:bg-muted/50">
          <h3 className="font-semibold text-primary">{track.name}</h3>
          <p className="text-sm text-muted-foreground">{track.downloadedTrail ? 'Downloaded track' : 'Custom track'} · {new Date(track.startedAt).toLocaleDateString()}</p>
          <p className="mt-2 text-sm">{(stats.distance / 1609.344).toFixed(2)} mi · Elevation gain: {stats.hasElevation ? `${Math.round(stats.gain * 3.28084)} ft` : 'Unavailable'}</p>
        </Link>;
      })}
    </div>
  </section>;
}
