import * as XLSX from 'xlsx/xlsx.mjs';
export interface WorkbookPhoto { sample: string; project: string; caption: string; bytes: Uint8Array; extension: 'png' | 'jpeg'; width: number; height: number; }
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
/** Add real embedded image parts, not signed URLs that expire after export.
 * Drawing structure: Microsoft Open XML OneCellAnchor / WorksheetDrawing.
 */
export function serializeWorkbookPhotos(workbook: XLSX.WorkBook, photos: WorkbookPhoto[]): Uint8Array<ArrayBuffer> {
  if (!photos.length) return new Uint8Array(XLSX.write(workbook, {type:'array',bookType:'xlsx'}));
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Sample ID', 'Project', 'Caption', 'Photo'],
    ...photos.map(photo => [photo.sample, photo.project, photo.caption, '']),
  ]);
  sheet['!cols'] = [{wch:26},{wch:26},{wch:48},{wch:55}];
  sheet['!rows'] = [{hpt:24}, ...photos.map(() => ({hpt:240}))];
  let name = 'Sample Photos';
  for (let n=2; workbook.SheetNames.includes(name); n++) name = `Sample Photos ${n}`;
  XLSX.utils.book_append_sheet(workbook, sheet, name);
  const sheetNumber = workbook.SheetNames.length;
  const archive = XLSX.CFB.read(new Uint8Array(XLSX.write(workbook, {type:'array',bookType:'xlsx'})), {type:'array'});
  const read = (path:string) => new TextDecoder().decode(XLSX.CFB.find(archive,"/"+path).content);
  const add = (path:string, data:string|Uint8Array) => XLSX.CFB.utils.cfb_add(archive,"/"+path, typeof data === 'string' ? new TextEncoder().encode(data) : data);
  const drawingName = 'geofieldPhotos';
  const anchors = photos.map((photo,i) => {
    const id=i+1;
    const scale = Math.min(380/photo.width,300/photo.height,1);
    const cx=Math.round(photo.width*scale*9525), cy=Math.round(photo.height*scale*9525);
    add(`xl/media/geofieldPhoto${id}.${photo.extension}`,photo.bytes);
    return `<xdr:oneCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>47625</xdr:colOff><xdr:row>${id}</xdr:row><xdr:rowOff>47625</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="Photo ${id}" descr="${escape(photo.sample)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  }).join('');
  add(`xl/drawings/${drawingName}.xml`, `${XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}">${anchors}</xdr:wsDr>`);
  add(`xl/drawings/_rels/${drawingName}.xml.rels`,`${XML}<Relationships xmlns="${PKG}">${photos.map((p,i)=>`<Relationship Id="rId${i+1}" Type="${REL}/image" Target="../media/geofieldPhoto${i+1}.${p.extension}"/>`).join('')}</Relationships>`);
  add(`xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`,`${XML}<Relationships xmlns="${PKG}"><Relationship Id="rIdGeoFieldPhotos" Type="${REL}/drawing" Target="../drawings/${drawingName}.xml"/></Relationships>`);
  const sheetPath=`xl/worksheets/sheet${sheetNumber}.xml`;
  add(sheetPath,read(sheetPath).replace('</worksheet>',`<drawing xmlns:r="${REL}" r:id="rIdGeoFieldPhotos"/></worksheet>`));
  let types=read('[Content_Types].xml');
  for(const extension of new Set(photos.map(p=>p.extension))) {
    if(!types.includes(`Extension="${extension}"`)) types=types.replace('</Types>',`<Default Extension="${extension}" ContentType="image/${extension}"/></Types>`);
  }
  types=types.replace('</Types>',`<Override PartName="/xl/drawings/${drawingName}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  add('[Content_Types].xml',types);
  return new Uint8Array(XLSX.CFB.write(archive,{type:'array',fileType:'zip',compression:true}));
}
