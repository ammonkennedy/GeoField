import { cn } from "@/lib/utils";

export function GeoFieldLogo({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}geofield-cube.png`}
      alt="GeoField"
      className={cn("block shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}
