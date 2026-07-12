export interface SoilLookupResult {
  noData?: boolean;
  mapUnit?: string | null;
  soilSeries?: string | null;
  pctComponent?: number | string | null;
  taxClass?: string | null;
  order?: string | null;
  suborder?: string | null;
  drainage?: string | null;
  slope?: number | string | null;
}

/** Direct USDA SDA lookup. SDA explicitly permits cross-origin browser POSTs. */
export async function lookupSoil(lat: number, lng: number): Promise<SoilLookupResult> {
  const query = `
    SELECT TOP 1 mu.muname, c.compname, c.comppct_r, c.taxclname,
      c.taxorder, c.taxsuborder, c.drainagecl, c.slope_r
    FROM mapunit mu
    LEFT JOIN component c ON mu.mukey = c.mukey AND c.majcompflag = 'Yes'
    WHERE mu.mukey IN (
      SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lng} ${lat})')
    )
    ORDER BY c.comppct_r DESC
  `;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://SDMDataAccess.sc.egov.usda.gov/tabular/post.rest", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `query=${encodeURIComponent(query)}&format=JSON`,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`USDA returned ${response.status}`);
    const data = await response.json();
    const row = data?.Table?.[0];
    if (!row) return { noData: true };
    return {
      mapUnit: row[0] ?? null,
      soilSeries: row[1] ?? null,
      pctComponent: row[2] ?? null,
      taxClass: row[3] ?? null,
      order: row[4] ?? null,
      suborder: row[5] ?? null,
      drainage: row[6] ?? null,
      slope: row[7] ?? null,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}
