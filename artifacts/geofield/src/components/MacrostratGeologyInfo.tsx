import type { MacrostratSelection } from "@/lib/macrostrat-types";
import { MACROSTRAT_ATTRIBUTION } from "@/lib/macrostrat-config";

export function MacrostratGeologyInfo({ selection }: { selection: MacrostratSelection | null }) {
  if (!selection) return <p className="text-sm text-muted-foreground">No geologic unit information is available at this location.</p>;
  const rows = [
    ["Unit", selection.displayName],
    ["Stratigraphic name", selection.unit.strat_name || selection.unit.strat_name_long],
    ["Geologic age", selection.age],
    ["Lithology", selection.lithology],
    ["Description", selection.description],
    ["Map source", selection.source],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return <div className="space-y-2.5">
    {selection.color && <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-sm border border-black/20" style={{ backgroundColor: selection.color.startsWith("#") ? selection.color : `#${selection.color}` }} /><span className="text-xs text-muted-foreground">Mapped unit color</span></div>}
    {rows.map(([label, value]) => <div key={label}><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 text-sm text-foreground">{value}</p></div>)}
    <p className="border-t border-border pt-2 text-xs text-muted-foreground">{MACROSTRAT_ATTRIBUTION}</p>
  </div>;
}
