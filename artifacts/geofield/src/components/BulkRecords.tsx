import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { applyBulkRecord, type BulkRecord } from '@/lib/bulk-records';
import { getStorageAccountId } from '@/lib/storage-account';
import { useToast } from '@/hooks/use-toast';

export function BulkRecords({ samples = [], measurements = [], datasets }: { samples?: any[]; measurements?: any[]; datasets: { id: string | number; name: string; cloudId?: string }[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const { toast } = useToast();
  const records: BulkRecord[] = [
    ...samples.filter(item => item.fields?.collectionStatus !== 'planned').map(item => ({ key: `sample:${item.id}`, id: String(item.id), kind: 'sample' as const, name: item.sampleId || 'Unnamed sample', sample: item })),
    ...measurements.map(item => ({ key: `measurement:${item.id}`, id: item.id, kind: 'measurement' as const, name: item.label || (item.measurementType === 'lineation' ? 'Lineation' : 'Strike & Dip') })),
  ];
  const chosen = records.filter(item => selected.includes(item.key));
  const run = (action: 'move' | 'delete') => {
    if (!account || account !== getStorageAccountId()) { toast({ title: 'Account changed. Reopen bulk selection.', variant: 'destructive' }); return; }
    if (action === 'move' && !target) return;
    if (action === 'move' && target !== 'uncategorized' && !datasets.some(d => String(d.cloudId || d.id) === target)) { toast({ title: 'Choose an available dataset', variant: 'destructive' }); return; }
    if (action === 'delete' && !confirm(`Delete ${chosen.length} selected records? You can restore them from Settings.`)) return;
    setBusy(true);
    const completed = new Set<string>(); const errors: string[] = [];
    for (const item of chosen) {
      try { applyBulkRecord(item, action, target === 'uncategorized' ? null : target); completed.add(item.key); }
      catch (error) { errors.push(`${item.name}: ${error instanceof Error ? error.message : 'Could not save'}`); }
    }
    setSelected(current => current.filter(key => !completed.has(key)));
    setBusy(false);
    toast({ title: `${completed.size} record${completed.size === 1 ? '' : 's'} ${action === 'delete' ? 'deleted' : 'moved'}`, description: errors.length ? `${errors.length} failed. ${errors[0]}` : 'Saved on this device; cloud changes will sync when connected.', variant: errors.length ? 'destructive' : undefined });
    if (!errors.length) setOpen(false);
  };
  return <>
    <Button type="button" variant="outline" disabled={!records.length} onClick={() => { setAccount(getStorageAccountId()); setSelected([]); setTarget(''); setOpen(true); }}>Select multiple</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }} panelClassName="max-w-2xl">
      <DialogHeader><DialogTitle>Organize samples &amp; measurements</DialogTitle></DialogHeader>
      <DialogContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" onClick={() => setSelected(records.map(item => item.key))}>Select all shown</Button><Button type="button" variant="ghost" onClick={() => setSelected([])}>Clear selection</Button><span className="text-sm">{chosen.length} selected</span></div>
        <div className="max-h-[40dvh] space-y-1 overflow-auto">{records.map(item => <label key={item.key} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={selected.includes(item.key)} onChange={event => setSelected(current => event.target.checked ? [...current, item.key] : current.filter(key => key !== item.key))} /><span className="min-w-0 break-words text-sm">{item.name}<span className="ml-2 text-xs text-muted-foreground">{item.kind}</span></span></label>)}</div>
        {samples.some(item => item.fields?.collectionStatus === 'planned') && <p className="text-xs text-muted-foreground">Future sample sites are managed from their trip; this selection includes collected samples and measurements.</p>}
        <label className="block space-y-1 text-sm">Move to dataset<select aria-label="Bulk destination dataset" className="h-11 w-full rounded-md border bg-background px-2" value={target} onChange={event => setTarget(event.target.value)}><option value="">Choose dataset</option><option value="uncategorized">Uncategorized</option>{datasets.map(d => <option key={d.id} value={String(d.cloudId || d.id)}>{d.name}</option>)}</select></label>
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !chosen.length || !target} onClick={() => run('move')}>Move selected</Button><Button type="button" variant="destructive" disabled={busy || !chosen.length} onClick={() => run('delete')}>Delete selected</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
