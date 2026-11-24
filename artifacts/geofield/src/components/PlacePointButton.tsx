import { PointPickerProjects } from './PointPickerProjects';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { lookupPointElevation } from '@/lib/point-elevation';
import { MapPin, X } from 'lucide-react';
import { Button } from './ui/button';
import { MapConnectivity } from './MapConnectivity';
import { TRIP_MAP_STYLE } from '@/lib/trip-map-style';
import { applyBaseMap, type BaseMap } from '@/lib/base-map';
import { observeMapSize } from '@/lib/map-resize';
import { latLngToUTM, parseCoords } from '@/lib/utm';
import { getStorageAccountId } from '@/lib/storage-account';
import 'maplibre-gl/dist/maplibre-gl.css';

type Point = { latitude: number; longitude: number; elevation: number | null };
export function PlacePointButton({ location, onSave }: { location: string; onSave: (point: Point) => void }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><MapPin className="h-4 w-4 mr-1" />Place point</Button>
    {open && <PointPicker location={location} onCancel={() => setOpen(false)} onSave={point => { onSave(point); setOpen(false); }} />}</>;
}
function PointPicker({ location, onCancel, onSave }: { location: string; onCancel: () => void; onSave: (point: Point) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [base, setBase] = useState<BaseMap>('satellite');
  const baseRef = useRef<BaseMap>('satellite');
  const [point, setPoint] = useState<Point | null>(null);
  const selected = useRef<Point | null>(null);
  const [error, setError] = useState('');
  const [loadingElevation, setLoadingElevation] = useState(false);
  const account = useRef(getStorageAccountId());
  useEffect(() => {
    if (!container.current) return;
    const parts = parseCoords(location);
    const valid = parts && Math.abs(parts[0]) <= 85;
    let instance: maplibregl.Map;
    try { instance = new maplibregl.Map({ container: container.current, style: structuredClone(TRIP_MAP_STYLE), center: valid ? [parts[1], parts[0]] : [-98.35, 39.5], zoom: valid ? 15 : 3 }); }
    catch { setError('The map could not open on this device. Close and try again.'); return; }
    setMap(instance);
    observeMapSize(instance);
    instance.addControl(new maplibregl.NavigationControl(), 'top-right');
    instance.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');
    const marker = new maplibregl.Marker({ color: '#1677ed', draggable: true });
    let request: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const choose = (lng: number, lat: number) => {
      const longitude = ((lng + 180) % 360 + 360) % 360 - 180;
      selected.current = { latitude: Number(lat.toFixed(7)), longitude: Number(longitude.toFixed(7)), elevation: null };
      marker.setLngLat([longitude, lat]).addTo(instance);
      setPoint(selected.current);
      request?.abort();
      clearTimeout(timer);
      const controller = new AbortController(); request = controller;
      timer = setTimeout(() => controller.abort(), 8000);
      const chosen = selected.current;
      setLoadingElevation(true);
      void lookupPointElevation(chosen.latitude, chosen.longitude, controller.signal).then(elevation => {
        if (request !== controller) return;
        clearTimeout(timer);
        selected.current = { ...chosen, elevation };
        setPoint(selected.current); setLoadingElevation(false);
      });
    };
    instance.on('load', () => { applyBaseMap(instance, baseRef.current);  });
    instance.on('click', event => choose(event.lngLat.lng, event.lngLat.lat));
    marker.on('dragend', () => { const position = marker.getLngLat(); choose(position.lng, position.lat); });
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', keydown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { request?.abort(); request = null; clearTimeout(timer); document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); marker.remove(); instance.remove(); };
  }, []);
  return createPortal(<div className="trip-map-overlay fixed inset-0 z-[200] flex h-[100dvh] min-h-0 items-center justify-center overflow-hidden bg-black/60 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="Place point">
    <div className="flex h-[90dvh] max-h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-card shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b p-4"><h2 className="text-xl font-bold">Place point</h2><Button type="button" variant="outline" onClick={onCancel} aria-label="Close map"><X /></Button></div>
      <div className="flex shrink-0 gap-1 border-b p-2">{(['satellite', 'street', 'topographic'] as const).map(layer => <Button type="button" key={layer} className="flex-1" variant={base === layer ? 'default' : 'outline'} onClick={() => { setBase(layer); baseRef.current = layer; if (map?.isStyleLoaded()) applyBaseMap(map, layer); }}>{layer === 'topographic' ? 'USGS Topo' : layer === 'street' ? 'Street' : 'Satellite'}</Button>)}</div>
      <PointPickerProjects map={map} />
      <MapConnectivity map={map} />
      <div ref={container} className="min-h-0 flex-1" />
      <div className="shrink-0 space-y-2 border-t p-3">
        {error && <p role="alert">{error}</p>}
        <p className="text-sm">{point ? `${point.latitude.toFixed(7)}, ${point.longitude.toFixed(7)}` : 'Tap the map to place a point. Drag the pin to adjust.'}</p>
        {point && <p className="text-xs text-muted-foreground">{point.latitude >= -80 && point.latitude <= 84 ? latLngToUTM(point.latitude, point.longitude).display : 'Outside UTM coverage'} · {loadingElevation ? 'Looking up terrain elevation…' : point.elevation === null ? 'Elevation unavailable. You can enter it manually.' : `Terrain elevation: ${point.elevation} m`}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="button" disabled={!point || loadingElevation} onClick={() => { if (point && account.current === getStorageAccountId()) onSave(point); else setError('Your account changed. Close this map and reopen the sheet.'); }}>Save</Button></div>
      </div>
    </div>
  </div>, document.body);
}
