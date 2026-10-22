import { TrackDatasetSelect } from '@/components/TrackDatasetSelect';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Route, Play, Square, MapPin, Trash2 } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { loadTracks, deleteTrack, startTracking, stopTracking, trackingStatus, updateTrack, TRACKS_UPDATED, TRACK_STATUS_UPDATED } from '@/lib/tracks';
import { trackStats } from '@/lib/track-math';
import { saveFile } from '@/lib/save-file';

export default function TrackPage() {
  const [, navigate] = useLocation();
  const [tracks, setTracks] = useState(() => loadTracks());
  const [status, setStatus] = useState(trackingStatus);
  const [error, setError] = useState('');
  const [namingTrackId, setNamingTrackId] = useState<string | null>(null);
  const [trackName, setTrackName] = useState('');
  const [nameError, setNameError] = useState('');
  const [deletingTrack, setDeletingTrack] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  useEffect(() => {
    const refresh = () => { setTracks(loadTracks()); setStatus(trackingStatus()); };
    window.addEventListener(TRACKS_UPDATED, refresh); window.addEventListener(TRACK_STATUS_UPDATED, refresh);
    return () => { window.removeEventListener(TRACKS_UPDATED, refresh); window.removeEventListener(TRACK_STATUS_UPDATED, refresh); };
  }, []);
  const run = async (action: () => void | Promise<void>) => { try { await action(); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save track.'); } };
  const finishTrack = async () => {
    const id = trackingStatus().activeId;
    if (!id || trackingStatus().stopping) return;
    await stopTracking();
    const saved = loadTracks().find(track => track.id === id);
    if (!saved?.stoppedAt) return;
    setTrackName(saved.name);
    setNameError('');
    setNamingTrackId(id);
  };
  return <Layout><div className="mx-auto max-w-4xl space-y-6">
    <h1 className="flex items-center gap-3 text-3xl font-bold"><Route className="text-primary" />Track</h1>
    <div className="rounded-2xl border bg-card p-5 space-y-3">
      <Button disabled={status.stopping} className="min-h-20 w-full gap-3 rounded-xl text-xl font-semibold [&_svg]:size-6" onClick={() => run(status.activeId ? finishTrack : startTracking)}>
        {status.activeId ? <><Square className="h-4 w-4" />Stop tracking</> : <><Play className="h-4 w-4" />Activate</>}
      </Button>
      {status.message && <p role="status" className="text-sm text-primary">{status.message}</p>}
    </div>
    {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
    {(['custom', 'downloaded'] as const).map(kind => {
      const group = [...tracks].reverse().filter(track => Boolean(track.downloadedTrail) === (kind === 'downloaded'));
      return <section key={kind} aria-labelledby={`${kind}-tracks-title`} className="space-y-4">
        <h2 id={`${kind}-tracks-title`} className="text-xl font-semibold">{kind === 'custom' ? 'Custom tracks' : 'Downloaded tracks'}</h2>
        {!group.length && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{kind === 'custom' ? 'No custom tracks yet.' : 'No downloaded tracks yet.'}</p>}
        {group.map(track => {
      const stats = trackStats(track.points);
      return <article key={track.id} className="rounded-2xl border bg-card p-5 space-y-4">
        <Link href={`/map?track=${encodeURIComponent(track.id)}`} onClick={event => { event.preventDefault(); void run(async () => { await updateTrack(track.id, { visible: true }); navigate(`/map?track=${encodeURIComponent(track.id)}`); }); }} className="block text-lg font-semibold text-primary hover:underline">{track.name}</Link>
        <Input key={`${track.id}:${track.name}`} aria-label="Track name" defaultValue={track.name} onBlur={e => run(() => updateTrack(track.id, { name: e.target.value.trim() || track.name }))} />
        <p className="text-xs text-muted-foreground">{new Date(track.startedAt).toLocaleString()} · {track.downloadedTrail ? (track.downloadedTrail.source === 'usgs' ? 'Downloaded trail segment · USGS' : 'Downloaded route · © OpenStreetMap contributors') : status.activeId === track.id ? 'Recording' : track.stoppedAt ? 'Saved' : 'Interrupted — saved points retained'} · {track.localRevision ? (status.activeId === track.id ? 'Syncs when stopped' : 'Waiting to sync') : 'Synced'}</p>
        <TrackDatasetSelect track={track} onChange={datasetId => run(() => updateTrack(track.id, { datasetId }))} />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[['Distance', `${(stats.distance / 1609.344).toFixed(2)} mi`], ['Elevation gain', stats.hasElevation ? `${Math.round(stats.gain * 3.28084)} ft` : 'Unavailable'], ['Elevation loss', stats.hasElevation ? `${Math.round(stats.loss * 3.28084)} ft` : 'Unavailable'], [track.downloadedTrail ? 'Coverage' : 'GPS time', track.downloadedTrail ? (track.downloadedTrail.source === 'usgs' ? 'Segment' : 'Mapped route') : `${Math.floor(stats.seconds / 60)} min`]].map(([label,value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-xl font-semibold text-primary">{value}</dd></div>)}
        </dl>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={track.visible} onChange={e => run(() => updateTrack(track.id, { visible: e.target.checked }))} />Show in Map View</label>
          <Link href={`/map?track=${encodeURIComponent(track.id)}`} onClick={event => { event.preventDefault(); void run(async () => { await updateTrack(track.id, { visible: true }); navigate(`/map?track=${encodeURIComponent(track.id)}`); }); }}><Button variant="outline" disabled={!track.points.length}><MapPin className="mr-2 h-4 w-4" />View route</Button></Link>
          <Button variant="destructive" disabled={status.activeId === track.id} onClick={() => { setDeleteError(''); setDeletingTrack({ id: track.id, name: track.name }); }}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
          <Button variant="outline" disabled={!track.points.length} onClick={async () => { try { await saveFile(new Blob([JSON.stringify(track, null, 2)], { type: 'application/json' }), `geofield-track-${track.id}.json`); } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); } }}>Export track</Button>
        </div>
      </article>;
    })}
    </section>;
    })}
    <Dialog open={deletingTrack !== null} onOpenChange={open => { if (!open) setDeletingTrack(null); }}>
      <DialogHeader><DialogTitle>Delete track?</DialogTitle></DialogHeader>
      <DialogContent>
        <p className="mb-4">Delete “{deletingTrack?.name}” from your saved tracks and map? This deletion will sync to your account.</p>
        {deleteError && <p role="alert" className="mb-4 text-destructive">{deleteError}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeletingTrack(null)}>Cancel</Button>
          <Button variant="destructive" onClick={async () => {
            try { if (deletingTrack) await deleteTrack(deletingTrack.id); setDeletingTrack(null); }
            catch (e) { setDeleteError(e instanceof Error ? e.message : 'Unable to delete track. Please retry.'); }
          }}>Delete track</Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={namingTrackId !== null} onOpenChange={open => { if (!open) setNamingTrackId(null); }}>
      <DialogHeader>
          <DialogTitle>Name your track</DialogTitle>
          <p className="text-sm text-muted-foreground">Your track is saved. Give it a name to find it later.</p>
      </DialogHeader>
      <DialogContent>
        <form className="space-y-4" onSubmit={async event => {
          event.preventDefault();
          const name = trackName.trim();
          if (!name) { setNameError('Enter a track name.'); return; }
          try {
            if (!namingTrackId) return;
            await updateTrack(namingTrackId, { name });
            setNamingTrackId(null);
          } catch (e) { setNameError(e instanceof Error ? e.message : 'Unable to save the name. Please retry.'); }
        }}>
          <label htmlFor="finished-track-name" className="text-sm font-medium">Track name</label>
          <Input id="finished-track-name" value={trackName} onChange={event => { setTrackName(event.target.value); setNameError(''); }} onFocus={event => event.target.select()} />
          {nameError && <p role="alert" className="text-sm text-destructive">{nameError}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setNamingTrackId(null)}>Keep current name</Button>
            <Button type="submit">Save name</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div></Layout>;
}
