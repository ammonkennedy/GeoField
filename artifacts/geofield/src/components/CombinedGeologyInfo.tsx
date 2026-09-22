import { MacrostratGeologyInfo } from './MacrostratGeologyInfo';
import { geologyText, type CombinedGeology } from '@/lib/combined-geology';

function UnitDetails({ unit }: { unit: Record<string, unknown> }) {
  return <dl className="space-y-2">{[
    ['Unit', unit.FullName || unit.Name], ['Geologic age', unit.Age],
    ['Rock / sediment type', unit.GeoMaterial], ['Description', unit.Description],
  ].map(([label, value]) => geologyText(value) && <div key={String(label)}><dt className="text-xs font-semibold text-muted-foreground">{String(label)}</dt><dd className="text-sm">{geologyText(value)}</dd></div>)}</dl>;
}

export function CombinedGeologyInfo({ geology }: { geology: CombinedGeology }) {
  return <div className="space-y-4 break-words">
    <p className="text-xs text-muted-foreground">Two map sources at this location. Map colors are from Macrostrat. Sources may differ in scale, boundaries, and interpretation; additional descriptions do not increase mapped precision.</p>
    {geology.warnings.map(warning => <p key={warning} role="status" className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>)}
    <section className="space-y-2"><h4 className="font-semibold text-sm">Macrostrat geology</h4><MacrostratGeologyInfo selection={geology.macrostrat} /></section>
    <section className="space-y-3 border-t pt-3"><h4 className="font-semibold text-sm">USGS surface geology</h4>
      {!geology.usgs.length && <p className="text-sm text-muted-foreground">No USGS unit returned at this location.</p>}
      {geology.usgs.map((unit, index) => <div key={`${unit.code}-${index}`} className="space-y-3 border-t pt-2">
        {unit.original && <div className="space-y-2"><h5 className="text-xs font-semibold">Original map description</h5><UnitDetails unit={unit.original} /></div>}
        {unit.synthesis && <div className="space-y-2"><h5 className="text-xs font-semibold">National synthesis · {unit.code}</h5><UnitDetails unit={unit.synthesis} /></div>}
        {!unit.original && !unit.synthesis && <p className="text-sm">Mapped unit: {unit.code}</p>}
        {unit.sources.map((source, i) => <p key={i} className="text-xs text-muted-foreground">{geologyText(source.Source)}{ /^https?:\/\//i.test(geologyText(source.URL)) && <> <a className="underline" href={geologyText(source.URL)} target="_blank" rel="noopener noreferrer">Source map</a></>}</p>)}
      </div>)}
      <a className="text-xs underline" href="https://doi.org/10.5066/P146VGVM" target="_blank" rel="noopener noreferrer">USGS Cooperative National Geologic Map · Earth Surface v2</a>
    </section>
  </div>;
}
