import type * as XLSX from 'xlsx';
import type { Sample } from '@workspace/api-client-react';
import { serializeWorkbookPhotos, type WorkbookPhoto } from './export-photo-workbook.ts';
import { datasetNameForId, type DatasetLookupItem } from './export.ts';
import { assertStorageAccount, getStorageAccountId } from './storage-account.ts';

export function samplePhotoAttachments(sample: Sample): any[] {
  const fields = (sample.fields ?? {}) as Record<string, any>;
  if (Array.isArray(fields.media)) return fields.media.filter(m => m && (m.kind || m.type) === 'photo');
  if (fields.primaryPhoto) return [typeof fields.primaryPhoto === 'string' ? {dataUrl:fields.primaryPhoto} : fields.primaryPhoto];
  return fields.photo ? [{dataUrl:fields.photo,caption:fields.photoCaption}] : [];
}
async function readPhoto(attachment: any): Promise<string> {
  const { getStoredMediaDataUrl } = await import('./media-storage.ts');
  for (const key of [attachment.localKey, attachment.storageKey]) {
    if (!key || key.startsWith('media/')) continue;
    const local = await getStoredMediaDataUrl(key).catch(() => null);
    if (local) return local;
  }
  if (attachment.dataUrl?.startsWith('data:image/')) return attachment.dataUrl;
  let url = attachment.cloudUrl || attachment.dataUrl;
  if (attachment.storageKey?.startsWith('media/')) {
    const { resolveSampleMediaUrl } = await import('@workspace/api-client-react');
    url = await resolveSampleMediaUrl(attachment.storageKey);
  }
  if (!url) throw new Error('Photo is not downloaded on this device.');
  const response = await fetch(url,{signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error('Could not download photo.');
  const blob=await response.blob();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not read photo.'));reader.readAsDataURL(blob);});
}
async function decodePhoto(source: string): Promise<Pick<WorkbookPhoto,'bytes'|'extension'|'width'|'height'>> {
  const image = new Image();
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Photo format could not be read.'));image.src=source;});
  // Keep original PNG/JPEG bytes. Convert other browser-readable formats for Excel.
  if (!/^data:image\/(png|jpeg);base64,/.test(source)) {
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d');if(!context) throw Error('Photo conversion unavailable.');
    context.drawImage(image,0,0);source=canvas.toDataURL('image/png');
  }
  const binary=atob(source.slice(source.indexOf(',')+1));
  return {bytes:Uint8Array.from(binary,c=>c.charCodeAt(0)),extension:source.startsWith('data:image/png')?'png':'jpeg',width:image.naturalWidth,height:image.naturalHeight};
}
export async function collectSampleWorkbookPhotos(samples: Sample[], datasets: DatasetLookupItem[], folderName: string, load: (attachment: any) => Promise<Pick<WorkbookPhoto, "bytes" | "extension" | "width" | "height">>, check: () => void) {
  const photos:WorkbookPhoto[]=[];
  for (const sample of samples) {
    for (const attachment of samplePhotoAttachments(sample)) {
      check();
      try {
        const photo=await load(attachment);check();
        photos.push({...photo,sample:sample.sampleId,project:datasets.length?datasetNameForId(sample.folderId,datasets):folderName,caption:attachment.caption||''});
      } catch(error) {
        throw new Error(`Could not export a photo for ${sample.sampleId}. Connect to download its photos and retry. No incomplete workbook was saved. ${error instanceof Error?error.message:''}`);
      }
    }
  }
  check();
  return photos;
}

export async function writeWorkbookWithSamplePhotos(workbook: XLSX.WorkBook, samples: Sample[], datasets: DatasetLookupItem[], folderName: string) {
  const account=getStorageAccountId();
  const check=()=>{if(account) assertStorageAccount(account);};
  const photos=await collectSampleWorkbookPhotos(samples,datasets,folderName,async attachment=>decodePhoto(await readPhoto(attachment)),check);
  return serializeWorkbookPhotos(workbook,photos);
}
