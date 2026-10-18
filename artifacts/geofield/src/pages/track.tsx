import { nativeTrackRecording } from '@/lib/track-location';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Route, Play, Square, MapPin } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loadTracks, startTracking, stopTracking, trackingStatus, updateTrack, TRACKS_UPDATED, TRACK_STATUS_UPDATED } from '@/lib/tracks';
import { trackStats } from '@/lib/track-math';
import { saveFile } from '@/lib/save-file';

export default function TrackPage() {
  const [tracks, setTracks] = useState(loadTracks);
  const [status, setStatus] = useState(trackingStatus);
  const [error, setError] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    const refresh = () => { setTracks(loadTracks()); setStatus(trackingStatus()); };
    window.addEventListener(TRACKS_UPDATED, refresh); window.addEventListener(TRACK_STATUS_UPDATED, refresh);
    return () => { window.removeEventListener(TRACKS_UPDATED, refresh); window.removeEventListener(TRACK_STATUS_UPDATED, refresh); };
  }, []);
  const run = async (action: () => void | Promise<void>) => { try { await action(); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save track.'); } };
  return <Layout><div className="mx-auto max-w-4xl space-y-6">
    <h1 className="flex items-center gap-3 text-3xl font-bold"><Route className="text-primary" />Track</h1>
    <p className="text-muted-foreground">Record your walking route, distance, and elevation changes.</p>
    <div className="rounded-2xl border bg-card p-5 space-y-3">
      <Button disabled={status.stopping} className="min-h-12 gap-2" onClick={() => run(status.activeId ? stopTracking : startTracking)}>
        {status.activeId ? <><Square className="h-4 w-4" />Stop tracking</> : <><Play className="h-4 w-4" />Activate</>}
      </Button>
      <p role="status" className="text-sm text-primary">{status.message || 'Ready to record'}</p>
      <p className="text-sm text-muted-foreground">{nativeTrackRecording() ? 'Activate uses your location to record this walk even while the screen is locked or GeoField is in the background. Stop tracking ends location recording. Do not force-close the app during a walk.' : 'Keep this browser tab visible and your screen unlocked while recording. You can switch between pages in GeoField.'} Points save on this device without service. Finished tracks sync with your account when connected.</p>
      <p className="text-xs text-muted-foreground">Distance and elevation are GPS estimates. Weak signals and gaps are excluded; elevation gain filters small height fluctuations.</p>
      <p className="text-xs text-muted-foreground">Map routes are blue, with a green start marker. Use Export track to keep a separate copy. GPS estimates depend on your phone and surroundings.</p>
    </div>
    {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
    <Button variant="outline" aria-expanded={showSaved} aria-controls="saved-tracks" onClick={() => setShowSaved(!showSaved)}>Saved tracks ({tracks.length})</Button>
    {showSaved && <section id="saved-tracks" className="space-y-4">
    <h2 className="text-xl font-semibold">Saved tracks</h2>
    <p className="text-sm text-muted-foreground">Downloaded trails and your recorded walks. Select View route to see a track on the map.</p>
    {!tracks.length && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Your recorded walks will appear here.</p>}
    {[...tracks].reverse().map(track => {
      const stats = trackStats(track.points);
      return <article key={track.id} className="rounded-2xl border bg-card p-5 space-y-4">
        <Link href={`/map?track=${encodeURIComponent(track.id)}`} onClick={() => run(() => updateTrack(track.id, { visible: true }))} className="block text-lg font-semibold text-primary hover:underline">{track.name}</Link>
        <Input aria-label="Track name" defaultValue={track.name} onBlur={e => run(() => updateTrack(track.id, { name: e.target.value.trim() || track.name }))} />
        <p className="text-xs text-muted-foreground">{new Date(track.startedAt).toLocaleString()} · {track.downloadedTrail ? (track.downloadedTrail.source === 'usgs' ? 'Downloaded trail segment · USGS' : 'Downloaded route · © OpenStreetMap contributors') : status.activeId === track.id ? 'Recording' : track.stoppedAt ? 'Saved' : 'Interrupted — saved points retained'} · {track.localRevision ? (status.activeId === track.id ? 'Syncs when stopped' : 'Waiting to sync') : 'Synced'}</p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[['Distance', `${(stats.distance / 1609.344).toFixed(2)} mi`], ['Elevation gain', stats.hasElevation ? `${Math.round(stats.gain * 3.28084)} ft` : 'Unavailable'], ['Elevation loss', stats.hasElevation ? `${Math.round(stats.loss * 3.28084)} ft` : 'Unavailable'], [track.downloadedTrail ? 'Coverage' : 'GPS time', track.downloadedTrail ? (track.downloadedTrail.source === 'usgs' ? 'Segment' : 'Mapped route') : `${Math.floor(stats.seconds / 60)} min`]].map(([label,value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-xl font-semibold text-primary">{value}</dd></div>)}
        </dl>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={track.visible} onChange={e => run(() => updateTrack(track.id, { visible: e.target.checked }))} />Show in Map View</label>
          <Link href={`/map?track=${encodeURIComponent(track.id)}`} onClick={() => run(() => updateTrack(track.id, { visible: true }))}><Button variant="outline" disabled={!track.points.length}><MapPin className="mr-2 h-4 w-4" />View route</Button></Link>
          <Button variant="outline" disabled={!track.points.length} onClick={async () => { try { await saveFile(new Blob([JSON.stringify(track, null, 2)], { type: 'application/json' }), `geofield-track-${track.id}.json`); } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); } }}>Export track</Button>
        </div>
      </article>;
    })}
    </section>}
  </div></Layout>;
}
