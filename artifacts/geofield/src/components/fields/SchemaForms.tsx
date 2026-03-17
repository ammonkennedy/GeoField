import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Compass } from "lucide-react";

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

export const WaterFields = ({ register }: any) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
    <div className="space-y-2"><Label>Water Temp (°C)</Label><Input type="number" step="0.1" {...register("fields.temperature")} /></div>
    <div className="space-y-2"><Label>pH Level</Label><Input type="number" step="0.1" {...register("fields.ph")} /></div>
    <div className="space-y-2"><Label>Dissolved Oxygen (mg/L)</Label><Input type="number" step="0.1" {...register("fields.do")} /></div>
    <div className="space-y-2"><Label>Conductivity (μS/cm)</Label><Input type="number" step="0.1" {...register("fields.conductivity")} /></div>
    <div className="space-y-2"><Label>Turbidity (NTU)</Label><Input type="number" step="0.1" {...register("fields.turbidity")} /></div>
    <div className="space-y-2"><Label>Flow Rate (m³/s)</Label><Input type="number" step="0.01" {...register("fields.flowRate")} /></div>
    <div className="space-y-2"><Label>Water Color</Label><Input {...register("fields.color")} placeholder="e.g. Clear, murky brown" /></div>
    <div className="space-y-2"><Label>Odor</Label><Input {...register("fields.odor")} placeholder="e.g. None, sulfur" /></div>
    <div className="space-y-2"><Label>Preservation Method</Label><Input {...register("fields.preservation")} placeholder="e.g. HNO3, None" /></div>
  </div>
);

export const RockFields = ({ register, onOpenCompass }: { register: any; onOpenCompass?: () => void }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
    {/* Rock Classification */}
    <div className="space-y-2">
      <Label>Rock Type</Label>
      <select className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" {...register("fields.rockType")}>
        <option value="">Select type...</option>
        <option value="Igneous">Igneous</option>
        <option value="Sedimentary">Sedimentary</option>
        <option value="Metamorphic">Metamorphic</option>
      </select>
    </div>
    <div className="space-y-2">
      <Label>Rock Name</Label>
      <Input {...register("fields.rockName")} placeholder="e.g. Basalt, Sandstone" />
    </div>
    <div className="space-y-2">
      <Label>Lithology</Label>
      <select className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" {...register("fields.lithology")}>
        <option value="">Select lithology...</option>
        <optgroup label="Clastic Sedimentary">
          <option value="Conglomerate">Conglomerate</option>
          <option value="Breccia">Breccia</option>
          <option value="Sandstone">Sandstone</option>
          <option value="Siltstone">Siltstone</option>
          <option value="Shale">Shale</option>
          <option value="Mudstone">Mudstone</option>
        </optgroup>
        <optgroup label="Chemical/Organic Sedimentary">
          <option value="Limestone">Limestone</option>
          <option value="Dolostone">Dolostone</option>
          <option value="Chert">Chert</option>
          <option value="Coal">Coal</option>
          <option value="Evaporite">Evaporite</option>
        </optgroup>
        <optgroup label="Igneous">
          <option value="Granite">Granite</option>
          <option value="Diorite">Diorite</option>
          <option value="Gabbro">Gabbro</option>
          <option value="Basalt">Basalt</option>
          <option value="Andesite">Andesite</option>
          <option value="Rhyolite">Rhyolite</option>
          <option value="Obsidian">Obsidian</option>
          <option value="Pumice">Pumice</option>
          <option value="Tuff">Tuff</option>
        </optgroup>
        <optgroup label="Metamorphic">
          <option value="Quartzite">Quartzite</option>
          <option value="Marble">Marble</option>
          <option value="Slate">Slate</option>
          <option value="Phyllite">Phyllite</option>
          <option value="Schist">Schist</option>
          <option value="Gneiss">Gneiss</option>
          <option value="Hornfels">Hornfels</option>
          <option value="Amphibolite">Amphibolite</option>
        </optgroup>
      </select>
    </div>

    {/* Physical Properties */}
    <div className="space-y-2"><Label>Color</Label><Input {...register("fields.color")} /></div>
    <div className="space-y-2"><Label>Texture</Label><Input {...register("fields.texture")} placeholder="e.g. Fine, Porphyritic" /></div>
    <div className="space-y-2">
      <Label>Sorting</Label>
      <select className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" {...register("fields.sorting")}>
        <option value="">Select sorting...</option>
        <option value="Very Well Sorted">Very Well Sorted</option>
        <option value="Well Sorted">Well Sorted</option>
        <option value="Moderately Sorted">Moderately Sorted</option>
        <option value="Poorly Sorted">Poorly Sorted</option>
        <option value="Very Poorly Sorted">Very Poorly Sorted</option>
        <option value="N/A">N/A (non-clastic)</option>
      </select>
    </div>
    <div className="space-y-2"><Label>Hardness (Mohs)</Label><Input type="number" step="0.5" max="10" min="1" {...register("fields.hardness")} /></div>
    <div className="space-y-2"><Label>Specific Gravity</Label><Input type="number" step="0.1" {...register("fields.specificGravity")} /></div>
    <div className="space-y-2"><Label>Magnetism</Label><Input {...register("fields.magnetism")} /></div>

    {/* Strike & Dip with Compass */}
    <div className="space-y-2 sm:col-span-2 lg:col-span-3">
      <div className="flex items-center justify-between">
        <Label>Strike / Dip</Label>
        {onOpenCompass && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={onOpenCompass}
          >
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

    <div className="space-y-2"><Label>Weight (g)</Label><Input type="number" step="0.1" {...register("fields.weight")} /></div>
  </div>
);

export const SoilFields = ({ register }: any) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
    <div className="space-y-2"><Label>Soil Texture</Label>
      <select className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" {...register("fields.texture")}>
        <option value="">Select texture...</option>
        <option value="Sand">Sand</option>
        <option value="Silt">Silt</option>
        <option value="Clay">Clay</option>
        <option value="Loam">Loam</option>
      </select>
    </div>
    <div className="space-y-2"><Label>Color (Munsell)</Label><Input {...register("fields.color")} placeholder="e.g. 10YR 4/6" /></div>
    <div className="space-y-2"><Label>Horizon</Label><Input {...register("fields.horizon")} placeholder="e.g. O, A, B, C" /></div>
    <div className="space-y-2"><Label>Moisture Content</Label>
      <select className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" {...register("fields.moisture")}>
        <option value="">Select...</option>
        <option value="Dry">Dry</option>
        <option value="Moist">Moist</option>
        <option value="Wet">Wet</option>
      </select>
    </div>
    <div className="space-y-2"><Label>pH Level</Label><Input type="number" step="0.1" {...register("fields.ph")} /></div>
    <div className="space-y-2"><Label>Depth (cm)</Label><Input type="number" step="0.1" {...register("fields.depth")} /></div>
    <div className="space-y-2"><Label>Structure</Label><Input {...register("fields.structure")} placeholder="e.g. Granular, Blocky" /></div>
    <div className="space-y-2"><Label>Organic Matter (%)</Label><Input type="number" step="0.1" {...register("fields.organicMatter")} /></div>
    <div className="space-y-2"><Label>Weight (g)</Label><Input type="number" step="0.1" {...register("fields.weight")} /></div>
  </div>
);
