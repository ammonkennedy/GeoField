import {
  uploadSampleMedia,
  resolveSampleMediaUrl,
  requireFieldNoteAccount,
} from "@workspace/api-client-react";
import { getStoredMediaDataUrl, storeMediaDataUrl } from "./media-storage";
import {
  prepareMeasurementPhoto,
  cacheMeasurementPhoto,
} from "./measurement-photo-sync";
import {
  loadMeasurements,
  saveMeasurements,
  type StrikeDipMeasurement,
} from "./strike-dip-measurements";
import { assertStorageAccount } from "./storage-account";
function photoStore(accountId: string) {
  return {
    read: getStoredMediaDataUrl,
    store: async (dataUrl: string) =>
      (
        await storeMediaDataUrl({
          kind: "photo",
          dataUrl,
          mimeType: "image/jpeg",
        })
      ).storageKey,
    upload: async (id: string, uploadId: string, dataUrl: string) => {
      await requireFieldNoteAccount(accountId);
      return (
        await uploadSampleMedia({
          sampleId: `measurement-${id}`,
          fileName: `${uploadId}.jpg`,
          mimeType: "image/jpeg",
          localUri: dataUrl,
          expectedAccountId: accountId,
        })
      ).storageKey;
    },
    download: async (key: string) => {
      await requireFieldNoteAccount(accountId);
      const response = await fetch(await resolveSampleMediaUrl(key), {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(
          "Network error downloading measurement photos. They will retry when connected.",
        );
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    },
  };
}
export function preparePhotoForMeasurement(
  item: StrikeDipMeasurement,
  accountId: string,
) {
  return prepareMeasurementPhoto(item, photoStore(accountId));
}
export async function downloadMeasurementPhotos(accountId: string) {
  assertStorageAccount(accountId);
  const errors: unknown[] = [];
  for (const item of loadMeasurements()) {
    try {
      const cached = await cacheMeasurementPhoto(item, photoStore(accountId));
      assertStorageAccount(accountId);
      if (cached === item) continue;
      saveMeasurements(
        loadMeasurements(true).map((latest) =>
          latest.id === item.id &&
          latest.photoKey === item.photoKey &&
          !latest.localRevision
            ? {
                ...latest,
                photo: undefined,
                photoLocalKey: cached.photoLocalKey,
              }
            : latest,
        ),
        { fromSync: true },
      );
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      "Some measurement photos could not download. Your records are saved; sync again to retry photos.",
    );
}
