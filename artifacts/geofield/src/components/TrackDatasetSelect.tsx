import { useEffect, useState } from 'react';
import { useGetFolders } from '@workspace/api-client-react';
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT } from '@/lib/local-datasets';
import { resolveDatasetId } from '@/lib/dataset-identity';
import type { WalkingTrack } from '@/lib/tracks';

export function TrackDatasetSelect({ track, onChange }: { track: WalkingTrack; onChange: (id: string | null) => void }) {
  const { data: folders } = useGetFolders();
  const [local, setLocal] = useState(() => getLocalDatasets());
  useEffect(() => {
    const refresh = () => setLocal(getLocalDatasets());
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refresh);
  }, []);
  const options = [...(folders ?? []), ...getVisibleLocalDatasets(local, folders)];
  const selected = String(resolveDatasetId(track.datasetId, local) ?? '');
  return <label className="block space-y-2 text-sm font-medium">
    <span>Project</span>
    <select aria-label={`Project for ${track.name}`} value={selected} onChange={event => onChange(event.target.value || null)} className="w-full rounded-xl border border-input bg-card px-3 py-3">
      <option value="">No project</option>
      {selected && !options.some(folder => String(folder.id) === selected) && <option value={selected}>Assigned project (unavailable)</option>}
      {options.map(folder => <option key={String(folder.id)} value={String(folder.id)}>{folder.name}</option>)}
    </select>
  </label>;
}
