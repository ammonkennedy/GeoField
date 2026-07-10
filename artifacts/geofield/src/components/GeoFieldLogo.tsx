import { cn } from "@/lib/utils";

export function GeoFieldLogo({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}geofield-logo.svg`}
      alt="GeoField"
      className={cn("block shrink-0 rounded-[22%]", className)}
      draggable={false}
    />
  );
}
