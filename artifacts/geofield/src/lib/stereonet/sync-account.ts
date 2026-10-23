import {
  putStereonetCloudObject,
  getStereonetCloudObject,
  listStereonetCloudObjects,
} from "@workspace/api-client-react";
import { assertStorageAccount } from "../storage-account";
import { loadStereonets, storeStereonets } from "./storage";
import { syncNetRecords, validateSnapshot } from "./sync";
export async function syncStereonets(accountId: string) {
  const check = () => assertStorageAccount(accountId);
  check();
  await syncNetRecords({
    load: () => {
      check();
      return loadStereonets(true);
    },
    save: (nets) => {
      check();
      storeStereonets(nets);
    },
    put: (s) => putStereonetCloudObject(s, s, accountId),
    get: (s) => getStereonetCloudObject(s, accountId),
    list: async () => {
      const objects = await listStereonetCloudObjects(accountId),
        result = [];
      for (const object of objects) {
        check();
        const s = validateSnapshot(
          await getStereonetCloudObject(object, accountId),
        );
        if (s.revision !== object.revision || s.parent !== object.parent)
          throw new Error(
            "Stereonet revision does not match the cloud object.",
          );
        result.push(s);
      }
      return result;
    },
  });
}
