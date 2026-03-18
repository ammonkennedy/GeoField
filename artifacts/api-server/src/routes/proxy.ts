import { Router } from "express";

const proxyRouter = Router();

// Proxies USDA Soil Data Access (SDA) spatial query — US coverage, avoids CORS
proxyRouter.get("/proxy/soil", async (req, res) => {
  const { lat, lng } = req.query as { lat?: string; lng?: string };
  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng required" });
  }

  const query = `
    SELECT TOP 1
      mu.muname,
      c.compname,
      c.comppct_r,
      c.taxclname,
      c.taxorder,
      c.taxsuborder,
      c.drainagecl,
      c.slope_r,
      c.tfact
    FROM mapunit mu
    LEFT JOIN component c
      ON mu.mukey = c.mukey AND c.majcompflag = 'Yes'
    WHERE mu.mukey IN (
      SELECT mukey
      FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lng} ${lat})')
    )
    ORDER BY c.comppct_r DESC
  `;

  try {
    const response = await fetch(
      "https://SDMDataAccess.sc.egov.usda.gov/tabular/post.rest",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `query=${encodeURIComponent(query)}&format=JSON`,
      }
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: "Upstream soil API error" });
    }
    const data = await response.json() as { Table?: any[][] };

    if (!data?.Table?.length) {
      return res.json({ noData: true });
    }

    const row = data.Table[0];
    return res.json({
      mapUnit:      row[0] ?? null,
      soilSeries:   row[1] ?? null,
      pctComponent: row[2] ?? null,
      taxClass:     row[3] ?? null,
      order:        row[4] ?? null,
      suborder:     row[5] ?? null,
      drainage:     row[6] ?? null,
      slope:        row[7] ?? null,
      tfact:        row[8] ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch soil data" });
  }
});

export default proxyRouter;
