import { trackSegments, type TrackPoint } from './track-math.ts';
export const KML_MIME = 'application/vnd.google-earth.kml+xml';
export interface EarthPoint {
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  color: string;
}
export interface EarthTrack { name: string; points: TrackPoint[] }
function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function color(hex: string) {
  const rgb = hex.replace('#', '');
  return /^[0-9a-f]{6}$/i.test(rgb) ? 'ff' + rgb.slice(4,6) + rgb.slice(2,4) + rgb.slice(0,2) : 'ff888888';
}
function validPoint(point: { latitude: number; longitude: number }) {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}
/** KML uses longitude,latitude; split routes preserve gaps in GPS recording. */
export function buildGoogleEarthKml(points: EarthPoint[], tracks: EarthTrack[]): string {
  const placemarks = points.filter(validPoint).map(point =>
    '<Placemark><name>' + xml(point.name) + '</name><description>' + xml(point.description) +
    '</description><Style><IconStyle><color>' + color(point.color) +
    '</color><scale>1.1</scale><Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>' +
    '<Point><altitudeMode>clampToGround</altitudeMode><coordinates>' + point.longitude + ',' + point.latitude + '</coordinates></Point></Placemark>');
  for (const track of tracks) {
    // Reject invalid tracks rather than joining across missing coordinates.
    if (track.points.some(point => !validPoint(point))) throw new Error('A track contains invalid coordinates. Please check it before exporting.');
    const segments = trackSegments(track.points);
    const geometry = segments.map(segment => '<LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>' +
      segment.map(([lng,lat]) => lng + ',' + lat).join(' ') + '</coordinates></LineString>').join('');
    if (geometry) placemarks.push('<Placemark><name>' + xml(track.name) +
      '</name><Style><LineStyle><color>ff4aa316</color><width>4</width></LineStyle></Style><MultiGeometry>' + geometry + '</MultiGeometry></Placemark>');
    else if (track.points.length === 1) {
      const point = track.points[0];
      placemarks.push('<Placemark><name>' + xml(track.name) + '</name><Point><coordinates>' + point.longitude + ',' + point.latitude + '</coordinates></Point></Placemark>');
    }
  }
  if (!placemarks.length) throw new Error('Select map records with coordinates or a saved track before opening Google Earth.');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>GeoField selected map data</name>' +
    placemarks.join('\n') + '</Document></kml>';
}
