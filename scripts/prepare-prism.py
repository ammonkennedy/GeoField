"""Build the pinned PRISM annual 1991–2020, 4 km climate layer.
Requires rasterio (install in a temporary venv). Downloads are cached to avoid
repeated requests to PRISM. Run: python scripts/prepare-prism.py /tmp/prism-source
Data redistribution: https://prism.oregonstate.edu/terms/
"""
import datetime, gzip, hashlib, json, pathlib, sys, urllib.request, zipfile
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
cache = pathlib.Path(sys.argv[1]); cache.mkdir(parents=True, exist_ok=True)
out = pathlib.Path(__file__).resolve().parents[1] / 'artifacts/geofield/public/prism'
out.mkdir(parents=True, exist_ok=True)
manifest = {'version': 1, 'period': '1991–2020', 'resolution': '4 km',
 'source': 'PRISM Group, Oregon State University', 'url': 'https://prism.oregonstate.edu',
 'accessed': datetime.date.today().isoformat(), 'variables': {}, 'nodata': -9999, 'crs': 'EPSG:4326'}
for variable in ['ppt', 'tmean', 'tmin', 'tmax']:
 url = f'https://data.prism.oregonstate.edu/normals/us/4km/{variable}/monthly/prism_{variable}_us_25m_2020_avg_30y.zip'
 archive = cache / f'{variable}.zip'
 if not archive.exists(): urllib.request.urlretrieve(url, archive)
 with zipfile.ZipFile(archive) as z:
  name = next(n for n in z.namelist() if n.endswith('.tif'))
  with rasterio.MemoryFile(z.read(name)) as memory:
   with memory.open() as src:
    assert src.width == 1405 and src.height == 621 and src.nodata == -9999
    data = np.full((src.height, src.width), -9999, dtype='<f4')
    reproject(source=rasterio.band(src, 1), destination=data, src_transform=src.transform,
      src_crs=src.crs, dst_transform=src.transform, dst_crs='EPSG:4326',
      src_nodata=-9999, dst_nodata=-9999, resampling=Resampling.nearest)
    geometry = dict(width=src.width, height=src.height, west=src.transform.c,
      north=src.transform.f, step=src.transform.a)
    if 'grid' in manifest: assert manifest['grid'] == geometry
    manifest['grid'] = geometry
    payload = gzip.compress(data.tobytes(), mtime=0)
    filename = f'{variable}-1991-2020.f32.gz'
    (out / filename).write_bytes(payload)
    manifest['variables'][variable] = dict(file=filename, units='mm' if variable == 'ppt' else '°C',
      original=url, sha256=hashlib.sha256(archive.read_bytes()).hexdigest(), bytes=len(payload))
    print(variable, len(payload), 'bytes', flush=True)
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
