import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Compass } from "lucide-react";

const sel = "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm";

/* ── BASE ──────────────────────────────────────────────────────────────── */
export const BaseFields = ({ register, errors }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div className="space-y-2">
      <Label htmlFor="sampleId">Sample ID / Label</Label>
      <Input id="sampleId" placeholder="e.g. W-24-001" {...register("sampleId")} />
      {errors.sampleId && <span className="text-xs text-destructive">{errors.sampleId.message}</span>}
    </div>
    <div className="space-y-2">
      <Label htmlFor="collectionDate">Collection Date &amp; Time</Label>
      <Input type="datetime-local" id="collectionDate" {...register("fields.collectionDate")} />
    </div>
    <div className="space-y-2 md:col-span-2">
      <Label htmlFor="location">Location / GPS</Label>
      <Input id="location" placeholder="Lat, Long or description" {...register("fields.location")} />
    </div>
  </div>
);

/* ── WATER ─────────────────────────────────────────────────────────────── */
export const WaterFields = ({ register }: any) => (
  <div className="space-y-6">
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Site &amp; Source</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Water Body Type</Label>
          <select className={sel} {...register("fields.waterBodyType")}>
            <option value="">Select...</option>
            <option>Stream / River</option>
            <option>Lake / Pond</option>
            <option>Spring</option>
            <option>Well / Groundwater</option>
            <option>Wetland</option>
            <option>Tidal / Estuarine</option>
            <option>Ocean</option>
            <option>Other</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Sampling Depth (m)</Label><Input type="number" step="0.1" {...register("fields.samplingDepth")} /></div>
        <div className="space-y-2"><Label>Flow Rate (m³/s)</Label><Input type="number" step="0.01" {...register("fields.flowRate")} /></div>
        <div className="space-y-2"><Label>Water Color</Label><Input {...register("fields.color")} placeholder="e.g. Clear, murky brown" /></div>
        <div className="space-y-2"><Label>Odor</Label><Input {...register("fields.odor")} placeholder="e.g. None, sulfur" /></div>
        <div className="space-y-2"><Label>Preservation Method</Label><Input {...register("fields.preservation")} placeholder="e.g. HNO3, None" /></div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Physical Parameters</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Water Temp (°C)</Label><Input type="number" step="0.1" {...register("fields.temperature")} /></div>
        <div className="space-y-2"><Label>Turbidity (NTU)</Label><Input type="number" step="0.1" {...register("fields.turbidity")} /></div>
        <div className="space-y-2"><Label>Total Dissolved Solids (mg/L)</Label><Input type="number" step="1" {...register("fields.tds")} /></div>
        <div className="space-y-2"><Label>Salinity (ppt)</Label><Input type="number" step="0.01" {...register("fields.salinity")} /></div>
        <div className="space-y-2"><Label>Suspended Sediment (mg/L)</Label><Input type="number" step="0.1" {...register("fields.suspendedSediment")} /></div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Chemical Parameters</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2"><Label>pH Level</Label><Input type="number" step="0.01" min="0" max="14" {...register("fields.ph")} /></div>
        <div className="space-y-2"><Label>Dissolved Oxygen (mg/L)</Label><Input type="number" step="0.1" {...register("fields.do")} /></div>
        <div className="space-y-2"><Label>DO Saturation (%)</Label><Input type="number" step="0.1" {...register("fields.doSaturation")} /></div>
        <div className="space-y-2"><Label>Conductivity (μS/cm)</Label><Input type="number" step="0.1" {...register("fields.conductivity")} /></div>
        <div className="space-y-2"><Label>ORP / Redox (mV)</Label><Input type="number" step="1" {...register("fields.orp")} /></div>
        <div className="space-y-2"><Label>Alkalinity (mg/L CaCO₃)</Label><Input type="number" step="1" {...register("fields.alkalinity")} /></div>
        <div className="space-y-2"><Label>Hardness (mg/L CaCO₃)</Label><Input type="number" step="1" {...register("fields.hardness")} /></div>
        <div className="space-y-2"><Label>Nitrate-N (mg/L)</Label><Input type="number" step="0.01" {...register("fields.nitrate")} /></div>
        <div className="space-y-2"><Label>Nitrite-N (mg/L)</Label><Input type="number" step="0.001" {...register("fields.nitrite")} /></div>
        <div className="space-y-2"><Label>Phosphate (mg/L)</Label><Input type="number" step="0.01" {...register("fields.phosphate")} /></div>
        <div className="space-y-2"><Label>Ammonia (mg/L)</Label><Input type="number" step="0.01" {...register("fields.ammonia")} /></div>
        <div className="space-y-2"><Label>Chloride (mg/L)</Label><Input type="number" step="0.1" {...register("fields.chloride")} /></div>
        <div className="space-y-2"><Label>Sulfate (mg/L)</Label><Input type="number" step="0.1" {...register("fields.sulfate")} /></div>
        <div className="space-y-2"><Label>Iron (mg/L)</Label><Input type="number" step="0.01" {...register("fields.iron")} /></div>
        <div className="space-y-2"><Label>BOD (mg/L)</Label><Input type="number" step="0.1" {...register("fields.bod")} /></div>
        <div className="space-y-2"><Label>COD (mg/L)</Label><Input type="number" step="0.1" {...register("fields.cod")} /></div>
        <div className="space-y-2"><Label>Fecal Coliform (CFU/100mL)</Label><Input type="number" step="1" {...register("fields.fecalColiform")} /></div>
      </div>
    </div>
  </div>
);

/* ── ROCK ──────────────────────────────────────────────────────────────── */
export const RockFields = ({ register, onOpenCompass }: { register: any; onOpenCompass?: () => void }) => (
  <div className="space-y-6">
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Classification</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Rock Type</Label>
          <select className={sel} {...register("fields.rockType")}>
            <option value="">Select type...</option>
            <option value="Igneous">Igneous</option>
            <option value="Sedimentary">Sedimentary</option>
            <option value="Metamorphic">Metamorphic</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Rock Name</Label><Input {...register("fields.rockName")} placeholder="e.g. Basalt, Sandstone" /></div>
        <div className="space-y-2">
          <Label>Lithology</Label>
          <select className={sel} {...register("fields.lithology")}>
            <option value="">Select lithology...</option>
            <optgroup label="Clastic Sedimentary">
              <option>Conglomerate</option><option>Breccia</option><option>Sandstone</option>
              <option>Siltstone</option><option>Shale</option><option>Mudstone</option>
            </optgroup>
            <optgroup label="Chemical / Organic Sedimentary">
              <option>Limestone</option><option>Dolostone</option><option>Chert</option>
              <option>Coal</option><option>Evaporite</option><option>Phosphorite</option>
            </optgroup>
            <optgroup label="Igneous – Plutonic">
              <option>Granite</option><option>Granodiorite</option><option>Diorite</option>
              <option>Gabbro</option><option>Peridotite</option><option>Dunite</option>
            </optgroup>
            <optgroup label="Igneous – Volcanic">
              <option>Basalt</option><option>Andesite</option><option>Rhyolite</option>
              <option>Dacite</option><option>Obsidian</option><option>Pumice</option><option>Tuff</option>
            </optgroup>
            <optgroup label="Metamorphic">
              <option>Quartzite</option><option>Marble</option><option>Slate</option>
              <option>Phyllite</option><option>Schist</option><option>Gneiss</option>
              <option>Hornfels</option><option>Amphibolite</option><option>Eclogite</option>
              <option>Blueschist</option><option>Greenschist</option>
            </optgroup>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Formation / Unit Name</Label>
          <Input {...register("fields.formation")} placeholder="e.g. Morrison Formation" />
        </div>
        <div className="space-y-2">
          <Label>Geologic Age</Label>
          <Input {...register("fields.geologicAge")} placeholder="e.g. Jurassic, ~150 Ma" />
        </div>
        <div className="space-y-2">
          <Label>Depositional Environment</Label>
          <select className={sel} {...register("fields.depositionalEnv")}>
            <option value="">Select...</option>
            <option>Fluvial</option><option>Deltaic</option><option>Lacustrine</option>
            <option>Aeolian</option><option>Glacial</option><option>Shallow Marine</option>
            <option>Deep Marine</option><option>Reef</option><option>Evaporitic</option>
            <option>Volcanic</option><option>Plutonic</option><option>N/A</option>
          </select>
        </div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Physical Properties</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Color (dry)</Label><Input {...register("fields.color")} placeholder="e.g. Dark gray" /></div>
        <div className="space-y-2"><Label>Color (wet)</Label><Input {...register("fields.colorWet")} placeholder="e.g. Black" /></div>
        <div className="space-y-2"><Label>Texture</Label><Input {...register("fields.texture")} placeholder="e.g. Fine, Porphyritic" /></div>
        <div className="space-y-2">
          <Label>Grain Size</Label>
          <select className={sel} {...register("fields.grainSize")}>
            <option value="">Select...</option>
            <option>Clay (&lt;0.004 mm)</option>
            <option>Silt (0.004–0.0625 mm)</option>
            <option>Very Fine Sand (0.0625–0.125 mm)</option>
            <option>Fine Sand (0.125–0.25 mm)</option>
            <option>Medium Sand (0.25–0.5 mm)</option>
            <option>Coarse Sand (0.5–1 mm)</option>
            <option>Very Coarse Sand (1–2 mm)</option>
            <option>Granule (2–4 mm)</option>
            <option>Pebble (4–64 mm)</option>
            <option>Cobble (64–256 mm)</option>
            <option>Boulder (&gt;256 mm)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Sorting</Label>
          <select className={sel} {...register("fields.sorting")}>
            <option value="">Select sorting...</option>
            <option>Very Well Sorted</option><option>Well Sorted</option>
            <option>Moderately Sorted</option><option>Poorly Sorted</option>
            <option>Very Poorly Sorted</option><option>N/A (non-clastic)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Roundness</Label>
          <select className={sel} {...register("fields.roundness")}>
            <option value="">Select...</option>
            <option>Very Angular</option><option>Angular</option><option>Sub-Angular</option>
            <option>Sub-Rounded</option><option>Rounded</option><option>Well Rounded</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Hardness (Mohs)</Label><Input type="number" step="0.5" max="10" min="1" {...register("fields.hardness")} /></div>
        <div className="space-y-2"><Label>Specific Gravity</Label><Input type="number" step="0.01" {...register("fields.specificGravity")} /></div>
        <div className="space-y-2"><Label>Magnetism</Label><Input {...register("fields.magnetism")} placeholder="e.g. None, Weakly magnetic" /></div>
        <div className="space-y-2"><Label>Effervescence (HCl)</Label>
          <select className={sel} {...register("fields.effervescence")}>
            <option value="">Select...</option>
            <option>None</option><option>Slight</option><option>Moderate</option><option>Strong</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Luster</Label><Input {...register("fields.luster")} placeholder="e.g. Vitreous, Metallic" /></div>
        <div className="space-y-2"><Label>Cleavage / Fracture</Label><Input {...register("fields.cleavage")} placeholder="e.g. Conchoidal, 2-dir 90°" /></div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Structure &amp; Fabric</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Bedding Thickness</Label>
          <select className={sel} {...register("fields.beddingThickness")}>
            <option value="">Select...</option>
            <option>Laminated (&lt;1 cm)</option><option>Very Thin (1–3 cm)</option>
            <option>Thin (3–10 cm)</option><option>Medium (10–30 cm)</option>
            <option>Thick (30–100 cm)</option><option>Very Thick (&gt;100 cm)</option>
            <option>Massive</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Foliation / Fabric</Label><Input {...register("fields.foliation")} placeholder="e.g. Gneissic, Schistose" /></div>
        <div className="space-y-2"><Label>Lineation</Label><Input {...register("fields.lineation")} placeholder="e.g. Mineral lineation 045/20" /></div>
        <div className="space-y-2"><Label>Fracture Pattern</Label>
          <select className={sel} {...register("fields.fracturePattern")}>
            <option value="">Select...</option>
            <option>Unfractured</option><option>Slightly fractured</option>
            <option>Moderately fractured</option><option>Highly fractured</option>
            <option>Faulted</option><option>Jointed</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Fossil Content</Label><Input {...register("fields.fossilContent")} placeholder="e.g. None, Brachiopods" /></div>
        <div className="space-y-2"><Label>Weathering Grade</Label>
          <select className={sel} {...register("fields.weatheringGrade")}>
            <option value="">Select...</option>
            <option>Fresh (W1)</option><option>Slightly Weathered (W2)</option>
            <option>Moderately Weathered (W3)</option><option>Highly Weathered (W4)</option>
            <option>Completely Weathered (W5)</option><option>Residual Soil (W6)</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Alteration</Label><Input {...register("fields.alteration")} placeholder="e.g. Propylitic, None" /></div>
        <div className="space-y-2"><Label>Mineral Composition</Label><Input {...register("fields.mineralComposition")} placeholder="e.g. 60% Qtz, 30% Fsp, 10% Bt" /></div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Orientation</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2 sm:col-span-2 lg:col-span-3">
          <div className="flex items-center justify-between">
            <Label>Strike / Dip</Label>
            {onOpenCompass && (
              <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={onOpenCompass}>
                <Compass className="w-3.5 h-3.5" />
                Use Compass
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Strike</span>
              <Input {...register("fields.strike")} placeholder="e.g. 045°" />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Dip</span>
              <Input {...register("fields.dip")} placeholder="e.g. 30°" />
            </div>
          </div>
        </div>
        <div className="space-y-2"><Label>Plunge / Trend (lineation)</Label><Input {...register("fields.plungeTrend")} placeholder="e.g. 20°/135°" /></div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sample Info</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Weight (g)</Label><Input type="number" step="0.1" {...register("fields.weight")} /></div>
        <div className="space-y-2"><Label>Sample Dimensions (cm)</Label><Input {...register("fields.dimensions")} placeholder="e.g. 8×6×4" /></div>
        <div className="space-y-2"><Label>Porosity (est. %)</Label><Input type="number" step="0.1" {...register("fields.porosity")} /></div>
        <div className="space-y-2"><Label>Thin Section Prepared</Label>
          <select className={sel} {...register("fields.thinSection")}>
            <option value="">Select...</option>
            <option>Yes</option><option>No</option><option>Planned</option>
          </select>
        </div>
      </div>
    </div>
  </div>
);

/* ── SOIL / SEDIMENT ───────────────────────────────────────────────────── */
export const SoilFields = ({ register }: any) => (
  <div className="space-y-6">
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Classification &amp; Horizon</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>USDA Soil Classification</Label>
          <select className={sel} {...register("fields.usdaClass")}>
            <option value="">Select order...</option>
            <option>Entisol</option><option>Inceptisol</option><option>Mollisol</option>
            <option>Alfisol</option><option>Ultisol</option><option>Oxisol</option>
            <option>Spodosol</option><option>Vertisol</option><option>Aridisol</option>
            <option>Histosol</option><option>Gelisol</option><option>Andisol</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Horizon Designation</Label><Input {...register("fields.horizon")} placeholder="e.g. O, A, B1, Bt, C" /></div>
        <div className="space-y-2"><Label>Sample Depth – Top (cm)</Label><Input type="number" step="0.1" {...register("fields.depthTop")} /></div>
        <div className="space-y-2"><Label>Sample Depth – Bottom (cm)</Label><Input type="number" step="0.1" {...register("fields.depthBottom")} /></div>
        <div className="space-y-2">
          <Label>Parent Material</Label>
          <select className={sel} {...register("fields.parentMaterial")}>
            <option value="">Select...</option>
            <option>Alluvium</option><option>Colluvium</option><option>Residuum</option>
            <option>Loess</option><option>Glacial Till</option><option>Glaciofluvial</option>
            <option>Aeolian Sand</option><option>Marine Sediment</option><option>Lacustrine</option>
            <option>Volcanic Ash</option><option>Organic</option><option>Anthropogenic Fill</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Boundary to Next Horizon</Label>
          <select className={sel} {...register("fields.horizonBoundary")}>
            <option value="">Select...</option>
            <option>Abrupt (&lt;2 cm)</option><option>Clear (2–5 cm)</option>
            <option>Gradual (5–15 cm)</option><option>Diffuse (&gt;15 cm)</option>
          </select>
        </div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Color &amp; Texture</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Color – Dry (Munsell)</Label><Input {...register("fields.colorDry")} placeholder="e.g. 10YR 5/3" /></div>
        <div className="space-y-2"><Label>Color – Moist (Munsell)</Label><Input {...register("fields.colorMoist")} placeholder="e.g. 10YR 3/2" /></div>
        <div className="space-y-2">
          <Label>Mottling</Label>
          <select className={sel} {...register("fields.mottling")}>
            <option value="">Select...</option>
            <option>None</option>
            <option>Few, Faint</option><option>Few, Distinct</option><option>Few, Prominent</option>
            <option>Common, Faint</option><option>Common, Distinct</option><option>Common, Prominent</option>
            <option>Many, Faint</option><option>Many, Distinct</option><option>Many, Prominent</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Texture Class (USDA)</Label>
          <select className={sel} {...register("fields.texture")}>
            <option value="">Select texture...</option>
            <option>Sand</option><option>Loamy Sand</option><option>Sandy Loam</option>
            <option>Sandy Clay Loam</option><option>Loam</option><option>Silt Loam</option>
            <option>Silt</option><option>Clay Loam</option><option>Silty Clay Loam</option>
            <option>Sandy Clay</option><option>Silty Clay</option><option>Clay</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Dominant Grain Size</Label>
          <select className={sel} {...register("fields.grainSize")}>
            <option value="">Select...</option>
            <option>Clay (&lt;0.002 mm)</option>
            <option>Fine Silt (0.002–0.02 mm)</option>
            <option>Coarse Silt (0.02–0.05 mm)</option>
            <option>Very Fine Sand (0.05–0.1 mm)</option>
            <option>Fine Sand (0.1–0.25 mm)</option>
            <option>Medium Sand (0.25–0.5 mm)</option>
            <option>Coarse Sand (0.5–2 mm)</option>
            <option>Gravel (&gt;2 mm)</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Sand % (field estimate)</Label><Input type="number" step="1" min="0" max="100" {...register("fields.sandPct")} /></div>
        <div className="space-y-2"><Label>Silt % (field estimate)</Label><Input type="number" step="1" min="0" max="100" {...register("fields.siltPct")} /></div>
        <div className="space-y-2"><Label>Clay % (field estimate)</Label><Input type="number" step="1" min="0" max="100" {...register("fields.clayPct")} /></div>
        <div className="space-y-2"><Label>Gravel / Coarse Frag. (%)</Label><Input type="number" step="1" min="0" max="100" {...register("fields.gravelPct")} /></div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Structure &amp; Consistence</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Structure Type</Label>
          <select className={sel} {...register("fields.structure")}>
            <option value="">Select...</option>
            <option>Granular</option><option>Crumb</option><option>Platy</option>
            <option>Angular Blocky</option><option>Sub-Angular Blocky</option>
            <option>Prismatic</option><option>Columnar</option><option>Massive</option><option>Single Grain</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Structure Grade</Label>
          <select className={sel} {...register("fields.structureGrade")}>
            <option value="">Select...</option>
            <option>Structureless</option><option>Weak</option><option>Moderate</option><option>Strong</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Consistence – Dry</Label>
          <select className={sel} {...register("fields.consistenceDry")}>
            <option value="">Select...</option>
            <option>Loose</option><option>Soft</option><option>Slightly Hard</option>
            <option>Hard</option><option>Very Hard</option><option>Extremely Hard</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Consistence – Moist</Label>
          <select className={sel} {...register("fields.consistenceMoist")}>
            <option value="">Select...</option>
            <option>Loose</option><option>Very Friable</option><option>Friable</option>
            <option>Firm</option><option>Very Firm</option><option>Extremely Firm</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Plasticity</Label>
          <select className={sel} {...register("fields.plasticity")}>
            <option value="">Select...</option>
            <option>Nonplastic</option><option>Slightly Plastic</option>
            <option>Moderately Plastic</option><option>Very Plastic</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Stickiness</Label>
          <select className={sel} {...register("fields.stickiness")}>
            <option value="">Select...</option>
            <option>Nonsticky</option><option>Slightly Sticky</option>
            <option>Moderately Sticky</option><option>Very Sticky</option>
          </select>
        </div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Moisture &amp; Hydrology</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Moisture Status</Label>
          <select className={sel} {...register("fields.moisture")}>
            <option value="">Select...</option>
            <option>Dry</option><option>Slightly Moist</option><option>Moist</option>
            <option>Very Moist</option><option>Wet</option><option>Saturated</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Gravimetric Water Content (%)</Label><Input type="number" step="0.1" {...register("fields.waterContent")} /></div>
        <div className="space-y-2">
          <Label>Drainage Class</Label>
          <select className={sel} {...register("fields.drainage")}>
            <option value="">Select...</option>
            <option>Excessively Drained</option><option>Well Drained</option>
            <option>Moderately Well Drained</option><option>Somewhat Poorly Drained</option>
            <option>Poorly Drained</option><option>Very Poorly Drained</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Permeability</Label>
          <select className={sel} {...register("fields.permeability")}>
            <option value="">Select...</option>
            <option>Very Rapid (&gt;150 mm/hr)</option><option>Rapid (50–150 mm/hr)</option>
            <option>Moderate (15–50 mm/hr)</option><option>Slow (5–15 mm/hr)</option>
            <option>Very Slow (1–5 mm/hr)</option><option>Impermeable (&lt;1 mm/hr)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Effervescence (HCl)</Label>
          <select className={sel} {...register("fields.effervescence")}>
            <option value="">Select...</option>
            <option>None</option><option>Slight</option><option>Strong</option><option>Violent</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Redoximorphic Features</Label>
          <select className={sel} {...register("fields.redox")}>
            <option value="">Select...</option>
            <option>None</option><option>Fe depletions</option><option>Fe/Mn concentrations</option>
            <option>Reduced matrix</option><option>Mixed</option>
          </select>
        </div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Chemistry</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2"><Label>pH (field)</Label><Input type="number" step="0.1" min="0" max="14" {...register("fields.ph")} /></div>
        <div className="space-y-2"><Label>Electrical Conductivity (mS/cm)</Label><Input type="number" step="0.01" {...register("fields.ec")} /></div>
        <div className="space-y-2"><Label>Organic Matter (%)</Label><Input type="number" step="0.1" {...register("fields.organicMatter")} /></div>
        <div className="space-y-2"><Label>Organic Carbon (%)</Label><Input type="number" step="0.01" {...register("fields.organicCarbon")} /></div>
        <div className="space-y-2"><Label>Total Nitrogen (%)</Label><Input type="number" step="0.001" {...register("fields.totalNitrogen")} /></div>
        <div className="space-y-2"><Label>Available P (mg/kg)</Label><Input type="number" step="0.1" {...register("fields.availableP")} /></div>
        <div className="space-y-2"><Label>CEC (cmol/kg)</Label><Input type="number" step="0.1" {...register("fields.cec")} /></div>
        <div className="space-y-2"><Label>Carbonate Content (%)</Label><Input type="number" step="0.1" {...register("fields.carbonate")} /></div>
        <div className="space-y-2"><Label>Exchangeable Na (cmol/kg)</Label><Input type="number" step="0.01" {...register("fields.exNa")} /></div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Physical Lab Parameters</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Bulk Density (g/cm³)</Label><Input type="number" step="0.01" {...register("fields.bulkDensity")} /></div>
        <div className="space-y-2"><Label>Particle Density (g/cm³)</Label><Input type="number" step="0.01" {...register("fields.particleDensity")} /></div>
        <div className="space-y-2"><Label>Porosity (%)</Label><Input type="number" step="0.1" {...register("fields.porosity")} /></div>
        <div className="space-y-2"><Label>Liquid Limit (%)</Label><Input type="number" step="0.1" {...register("fields.liquidLimit")} /></div>
        <div className="space-y-2"><Label>Plastic Limit (%)</Label><Input type="number" step="0.1" {...register("fields.plasticLimit")} /></div>
        <div className="space-y-2"><Label>Weight (g)</Label><Input type="number" step="0.1" {...register("fields.weight")} /></div>
      </div>
    </div>

    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Biota &amp; Site</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Root Density</Label>
          <select className={sel} {...register("fields.rootDensity")}>
            <option value="">Select...</option>
            <option>None</option><option>Few</option><option>Common</option><option>Many</option><option>Very Many</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Root Size</Label>
          <select className={sel} {...register("fields.rootSize")}>
            <option value="">Select...</option>
            <option>Very Fine (&lt;0.5 mm)</option><option>Fine (0.5–2 mm)</option>
            <option>Medium (2–5 mm)</option><option>Coarse (&gt;5 mm)</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Vegetation Cover (%)</Label><Input type="number" step="1" min="0" max="100" {...register("fields.vegCover")} /></div>
        <div className="space-y-2"><Label>Dominant Vegetation</Label><Input {...register("fields.vegetation")} placeholder="e.g. Tallgrass prairie" /></div>
        <div className="space-y-2"><Label>Biological Crust</Label>
          <select className={sel} {...register("fields.bioCrust")}>
            <option value="">Select...</option>
            <option>None</option><option>Cyanobacterial</option><option>Lichen</option>
            <option>Moss</option><option>Mixed</option>
          </select>
        </div>
        <div className="space-y-2"><Label>Slope Aspect</Label><Input {...register("fields.slopeAspect")} placeholder="e.g. 180° (South)" /></div>
        <div className="space-y-2"><Label>Slope Gradient (%)</Label><Input type="number" step="0.1" {...register("fields.slopeGradient")} /></div>
        <div className="space-y-2"><Label>Land Use</Label>
          <select className={sel} {...register("fields.landUse")}>
            <option value="">Select...</option>
            <option>Forest</option><option>Grassland / Rangeland</option><option>Cropland</option>
            <option>Urban</option><option>Wetland</option><option>Bare / Disturbed</option><option>Other</option>
          </select>
        </div>
      </div>
    </div>
  </div>
);
