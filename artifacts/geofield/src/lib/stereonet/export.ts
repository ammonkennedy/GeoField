import { saveFile } from "../save-file";
import type { Stereonet } from "./model";
import { normalizedMeasurement } from "./model";
const csv = (value: unknown) => {
  const s =
    typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  return '"' + (/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"';
};
export function stereonetCsv(net: Stereonet) {
  const header = [
    "id",
    "project",
    "kind",
    "name",
    "feature",
    "azimuth_RHR_strike_or_trend",
    "dip_or_plunge",
    "original_north",
    "declination_east_positive",
    "plot_north",
    "plot_azimuth",
    "notes",
    "source_id",
    "created_at",
    "raw_metadata",
  ];
  return (
    "\ufeff" +
    [
      header,
      ...net.measurements.map((m) => {
        const group = net.groups.find((g) => g.id === m.groupId)!;
        let normalized: number | string = "unresolved";
        try {
          normalized = normalizedMeasurement(m, group, net.north).azimuth;
        } catch {}
        return [
          m.id,
          group.name,
          m.kind,
          m.name,
          m.feature,
          m.azimuth,
          m.inclination,
          m.north,
          m.declination ?? group.declination,
          net.north,
          normalized,
          m.notes,
          m.sourceId,
          m.createdAt,
          m.raw,
        ];
      }),
    ]
      .map((row) => row.map(csv).join(","))
      .join("\r\n")
  );
}
/** Single-page PDF with an embedded JPEG. No new runtime library needed. */
export function imagePdf(
  jpeg: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const encoder = new TextEncoder(),
    parts: Uint8Array[] = [],
    offsets = [0];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const b = typeof data === "string" ? encoder.encode(data) : data;
    parts.push(b);
    length += b.length;
  };
  const pageWidth = 595,
    pageHeight = Math.round((pageWidth * height) / width);
  push("%PDF-1.4\n");
  const object = (id: number, body: string) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  offsets[4] = length;
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream\nendobj\n");
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
  object(
    5,
    `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
  );
  const xref = length;
  push("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++)
    push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const output = new Uint8Array(length);
  let position = 0;
  for (const p of parts) {
    output.set(p, position);
    position += p.length;
  }
  return output;
}
export async function exportStereonet(
  net: Stereonet,
  svg: SVGSVGElement,
  format: "png" | "pdf" | "csv",
  analysis = "",
) {
  const name = net.name.replace(/[^\p{L}\p{N}_-]/gu, "_") || "Stereonet";
  if (format === "csv")
    return saveFile(
      new Blob([stereonetCsv(net)], { type: "text/csv;charset=utf-8" }),
      name + ".csv",
    );
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelector("[data-net-geometry]")?.removeAttribute("transform");
  const width = 1800,
    height = Math.round(svg.viewBox.baseVal.height * 3);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml",
    }),
  );
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("Could not render stereonet export."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height + (analysis ? 180 : 0);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image export is unavailable.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, canvas.height);
    ctx.drawImage(img, 0, 0);
    if (analysis) {
      ctx.fillStyle = "#172033";
      ctx.font = "30px Arial";
      const words = analysis.split(" ");
      let row = "",
        y = height + 40;
      for (const word of words) {
        if (ctx.measureText(row + " " + word).width > 1680) {
          ctx.fillText(row, 60, y);
          y += 38;
          row = word;
        } else row += " " + word;
      }
      ctx.fillText(row, 60, y);
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Could not encode stereonet.")),
        format === "pdf" ? "image/jpeg" : "image/png",
        0.95,
      ),
    );
    if (format === "png") return saveFile(blob, name + ".png");
    const pdf = imagePdf(
      new Uint8Array(await blob.arrayBuffer()),
      width,
      canvas.height,
    );
    return saveFile(
      new Blob([pdf as BlobPart], { type: "application/pdf" }),
      name + ".pdf",
      { previewAfterSave: true },
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
