import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useGetFolders, useGetSamples } from '@workspace/api-client-react';
import { DatasetMultiSelect } from './DatasetMultiSelect';
import { Button } from './ui/button';
import { datasetOptions, datasetSelected, type DatasetSelection } from '@/lib/dataset-selection';
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT } from '@/lib/local-datasets';
import { getCachedCloudSamples, mergeCloudAndLocal, CLOUD_SAMPLES_UPDATED_EVENT } from '@/lib/cloud-samples';
import { getQueue, QUEUE_UPDATED_EVENT } from '@/lib/offline-queue';
import { loadMeasurements, STRIKE_DIP_UPDATED_EVENT } from '@/lib/strike-dip-measurements';
import { parseCoords } from '@/lib/utm';
import { getStorageAccountId } from '@/lib/storage-account';

function readLocal() {
  return { projects: getLocalDatasets(), samples: getCachedCloudSamples(), queue: getQueue(), measurements: loadMeasurements() };
}
/** Reference markers never edit the point being placed. */
export function PointPickerProjects({ map }: { map: maplibregl.Map | null }) {
  const { data: folders } = useGetFolders();
  const { data: serverSamples } = useGetSamples();
  const [local, setLocal] = useState(readLocal);
  const [selection, setSelection] = useState<DatasetSelection>([]);
  const account = useRef(getStorageAccountId());
  const [accountChanged, setAccountChanged] = useState(false);
  useEffect(() => {
    const refresh = () => {
      if (account.current !== getStorageAccountId()) { setAccountChanged(true); return; }
      setLocal(readLocal());
    };
    const events = [LOCAL_DATASETS_UPDATED_EVENT, CLOUD_SAMPLES_UPDATED_EVENT, QUEUE_UPDATED_EVENT, STRIKE_DIP_UPDATED_EVENT, 'storage', 'focus'];
    events.forEach(event => window.addEventListener(event, refresh));
    return () => events.forEach(event => window.removeEventListener(event, refresh));
  }, []);
  const samples = useMemo(() => {
    const cloud = mergeCloudAndLocal(serverSamples ?? [], local.samples).filter(sample =>
      !local.queue.some(item => String(item.targetId ?? item.queuedId) === String(sample.id)));
    const queued = local.queue.filter(item => !item.deletedAt).map(item => ({ ...item.payload, id: item.queuedId, targetId: item.targetId, isOffline: true }));
    return mergeCloudAndLocal<(typeof cloud)[number] | (typeof queued)[number]>(cloud, queued).filter(sample => !('deletedAt' in sample && sample.deletedAt));
  }, [serverSamples, local]);
  const points = useMemo(() => {
    if (accountChanged || account.current !== getStorageAccountId()) return [];
    const samplePoints = samples.flatMap(sample => {
      const coords = parseCoords(sample.fields?.location);
      return coords ? [{ id: `sample-${sample.id}`, project: sample.folderId, coords, label: `${sample.sampleId || 'Sample'}${sample.fields?.collectionStatus === 'planned' ? ' · Future sample site' : ''}`, color: '#d97706' }] : [];
    });
    const measurements = local.measurements.flatMap(item => {
      const coords = Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
        ? parseCoords(`${item.latitude}, ${item.longitude}`) : parseCoords(item.location);
      return coords ? [{ id: `measurement-${item.id}`, project: item.datasetId, coords, label: `${item.label || 'Measurement'} · ${item.featureType || 'Measurement'}`, color: '#9333ea' }] : [];
    });
    return [...samplePoints, ...measurements];
  }, [samples, local, accountChanged]);
  const options = datasetOptions([...(folders ?? []), ...getVisibleLocalDatasets(local.projects, folders)], local.projects, points.map(point => point.project));
  const visible = useMemo(() => points.filter(point => datasetSelected(selection, point.project, local.projects)), [points, selection, local.projects]);
  useEffect(() => {
    if (!map) return;
    const markers = visible.map(point => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'h-5 w-5 rounded-full border-2 border-white shadow-md';
      element.style.backgroundColor = point.color;
      element.title = point.label;
      element.setAttribute('aria-label', point.label);
      element.addEventListener('click', event => event.stopPropagation());
      const content = document.createElement('div');
      content.textContent = point.label;
      content.addEventListener('click', event => event.stopPropagation());
      return new maplibregl.Marker({ element }).setLngLat([point.coords[1], point.coords[0]])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setDOMContent(content)).addTo(map);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [map, visible]);
  return <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
    <span className="text-sm font-medium">Display project points</span>
    <DatasetMultiSelect options={accountChanged ? [] : options} identities={local.projects} value={selection} onChange={setSelection} />
    <Button type="button" variant="outline" size="sm" disabled={!map || !visible.length} onClick={() => {
      if (!map || !visible.length) return;
      const bounds = new maplibregl.LngLatBounds();
      visible.forEach(point => bounds.extend([point.coords[1], point.coords[0]]));
      map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
    }}>Show points</Button>
    <span className="text-xs text-muted-foreground">{visible.length} points · Orange: samples · Purple: measurements</span>
  </div>;
}
