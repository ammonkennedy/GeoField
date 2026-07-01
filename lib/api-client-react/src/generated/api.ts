import { useMutation, useQuery } from "@tanstack/react-query";
import type { QueryKey, UseMutationOptions, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import { Amplify } from "aws-amplify";
import { confirmSignUp, fetchUserAttributes, getCurrentUser, signIn, signOut, signUp } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import outputs from "../../../../amplify_outputs.json";
import type { Schema } from "../../../../amplify/data/resource";
import type {
  AuthUserEnvelope,
  CreateFolderRequest,
  CreateSampleRequest,
  Folder,
  GetSamplesParams,
  HealthStatus,
  MoveSampleRequest,
  Sample,
  UpdateSampleRequest,
} from "./api.schemas";

Amplify.configure(outputs);

const client = generateClient<Schema>();

type ErrorType<T = unknown> = Error & { data?: T };

type MutationOptions<TData, TVariables> = {
  mutation?: UseMutationOptions<TData, ErrorType<unknown>, TVariables>;
};

type QueryOptions<TData> = {
  query?: UseQueryOptions<TData, ErrorType<unknown>, TData>;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeFolderId(folderId: unknown): string | null | undefined {
  if (folderId === undefined) return undefined;
  if (folderId === null || folderId === "") return null;
  if (typeof folderId === "number" && Number.isNaN(folderId)) return null;
  const value = String(folderId).trim();
  if (!value || value === "NaN" || value === "undefined" || value === "null") return null;
  return value;
}

function currentSampleIdFallback(id: string | number | null | undefined): string | number {
  if (id !== undefined && id !== null && String(id) !== "NaN") return id;
  if (typeof globalThis === "undefined" || !("location" in globalThis)) return id as any;
  const parts = globalThis.location.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  if (!last || last === "new" || last === "sample") return id as any;
  return last;
}

function cleanFields(fields: unknown) {
  return JSON.parse(JSON.stringify(fields ?? {}));
}

function parseFields(fields: unknown) {
  if (!fields) return {};
  if (typeof fields === "string") {
    try {
      return JSON.parse(fields);
    } catch {
      return {};
    }
  }
  return fields;
}

function serializeFields(fields: unknown) {
  return JSON.stringify(cleanFields(fields));
}

function stripLargeMediaFields(fields: unknown) {
  const cleaned = cleanFields(fields) as Record<string, unknown>;
  delete cleaned.photo;
  delete cleaned.media;
  delete cleaned.primaryPhoto;
  delete cleaned.photoCount;
  delete cleaned.videoCount;
  return cleaned;
}

function asFolder(dataset: any): Folder {
  return {
    id: dataset.id,
    name: dataset.name,
    description: dataset.description ?? null,
    userId: dataset.owner ?? "",
    createdAt: dataset.createdAt ?? nowIso(),
  } as Folder;
}

function asSample(sample: any): Sample {
  return {
    id: sample.id,
    sampleType: sample.sampleType,
    sampleId: sample.sampleId,
    userId: sample.owner ?? "",
    folderId: sample.datasetId ?? null,
    notes: sample.notes ?? null,
    fields: parseFields(sample.fields),
    createdAt: sample.createdAt ?? nowIso(),
    updatedAt: sample.updatedAt ?? sample.createdAt ?? nowIso(),
  } as Sample;
}

function cleanObject<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null)) as T;
}

export const getHealthCheckUrl = () => "/api/healthz";
export const healthCheck = async (): Promise<HealthStatus> => ({ status: "ok" });
export const getHealthCheckQueryKey = () => ["health"] as const;
export function useHealthCheck<TData = HealthStatus>(options?: QueryOptions<any>): UseQueryResult<TData, ErrorType<unknown>> & { queryKey: QueryKey } {
  const queryKey = getHealthCheckQueryKey();
  const query = useQuery({ queryKey, queryFn: healthCheck, ...(options?.query as any) }) as any;
  return { ...query, queryKey };
}

export const getGetCurrentAuthUserUrl = () => "/auth/current-user";
export const getGetCurrentAuthUserQueryKey = () => ["auth", "current-user"] as const;
export async function getCurrentAuthUser(): Promise<AuthUserEnvelope> {
  try {
    const user = await getCurrentUser();
    const attributes = await fetchUserAttributes().catch(() => ({} as Record<string, string | undefined>));
    return {
      user: {
        id: user.userId,
        email: attributes.email ?? user.signInDetails?.loginId ?? null,
        firstName: attributes.given_name ?? null,
        lastName: attributes.family_name ?? null,
        profileImageUrl: null,
      },
    };
  } catch {
    return { user: null };
  }
}
export function useGetCurrentAuthUser<TData = AuthUserEnvelope>(options?: QueryOptions<any>): UseQueryResult<TData, ErrorType<unknown>> & { queryKey: QueryKey } {
  const queryKey = getGetCurrentAuthUserQueryKey();
  const query = useQuery({ queryKey, queryFn: getCurrentAuthUser, retry: false, ...(options?.query as any) }) as any;
  return { ...query, queryKey };
}

export async function signInUser(input: { email: string; password: string }) {
  const result = await signIn({ username: input.email.trim(), password: input.password });
  return result;
}
export async function signUpUser(input: { email: string; password: string }) {
  return signUp({ username: input.email.trim(), password: input.password, options: { userAttributes: { email: input.email.trim() } } });
}
export async function confirmSignUpUser(input: { email: string; code: string }) {
  return confirmSignUp({ username: input.email.trim(), confirmationCode: input.code.trim() });
}
export async function signOutUser() {
  await signOut();
}

export const getBeginBrowserLoginUrl = () => "/login";
export const beginBrowserLogin = async () => null;
export const getBeginBrowserLoginQueryKey = () => ["auth", "begin-login"] as const;
export function useBeginBrowserLogin<TData = unknown>(options?: QueryOptions<any>): UseQueryResult<TData, ErrorType<void>> & { queryKey: QueryKey } {
  const queryKey = getBeginBrowserLoginQueryKey();
  const query = useQuery({ queryKey, queryFn: beginBrowserLogin, enabled: false, ...(options?.query as any) }) as any;
  return { ...query, queryKey };
}

export const getGetFoldersQueryKey = () => ["datasets"] as const;
export async function getFolders(): Promise<Folder[]> {
  const { data, errors } = await client.models.Dataset.list();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  return (data ?? []).map(asFolder);
}
export function useGetFolders<TData = Folder[]>(options?: QueryOptions<any>): UseQueryResult<TData, ErrorType<unknown>> & { queryKey: QueryKey } {
  const queryKey = getGetFoldersQueryKey();
  const query = useQuery({ queryKey, queryFn: getFolders, retry: false, ...(options?.query as any) }) as any;
  return { ...query, queryKey };
}

export async function createFolder({ data }: { data: CreateFolderRequest }): Promise<Folder> {
  const result = await client.models.Dataset.create({ name: data.name, description: data.description ?? "", createdAt: nowIso(), updatedAt: nowIso() });
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
  return asFolder(result.data);
}
export function useCreateFolder(options?: MutationOptions<Folder, { data: CreateFolderRequest }>) {
  return useMutation({ mutationFn: createFolder, ...(options?.mutation as any) });
}

export async function updateFolder({ id, data }: { id: string | number; data: CreateFolderRequest }): Promise<Folder> {
  const result = await client.models.Dataset.update(cleanObject({ id: String(id), name: data.name, description: data.description ?? "", updatedAt: nowIso() }));
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
  return asFolder(result.data);
}
export function useUpdateFolder(options?: MutationOptions<Folder, { id: string | number; data: CreateFolderRequest }>) {
  return useMutation({ mutationFn: updateFolder, ...(options?.mutation as any) });
}

export async function deleteFolder({ id }: { id: string | number }): Promise<void> {
  const result = await client.models.Dataset.delete({ id: String(id) });
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
}
export function useDeleteFolder(options?: MutationOptions<void, { id: string | number }>) {
  return useMutation({ mutationFn: deleteFolder, ...(options?.mutation as any) });
}

export const getGetSamplesQueryKey = (params?: GetSamplesParams) => params?.folderId ? ["samples", String(params.folderId)] as const : ["samples"] as const;
export async function getSamples(params?: GetSamplesParams): Promise<Sample[]> {
  const { data, errors } = await client.models.Sample.list();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  const samples = (data ?? []).map(asSample);
  if (params?.folderId == null) return samples;
  return samples.filter((sample: any) => String(sample.folderId ?? "") === String(params.folderId));
}
export function useGetSamples<TData = Sample[]>(params?: GetSamplesParams, options?: QueryOptions<any>): UseQueryResult<TData, ErrorType<unknown>> & { queryKey: QueryKey } {
  const queryKey = getGetSamplesQueryKey(params);
  const query = useQuery({ queryKey, queryFn: () => getSamples(params), retry: false, ...(options?.query as any) }) as any;
  return { ...query, queryKey };
}

export const getGetSampleQueryKey = (id: string | number) => ["sample", String(id)] as const;
export async function getSample(id: string | number): Promise<Sample> {
  const sampleId = currentSampleIdFallback(id);
  const result = await client.models.Sample.get({ id: String(sampleId) });
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
  if (!result.data) throw new Error("Sample not found");
  return asSample(result.data);
}
export function useGetSample<TData = Sample>(id: string | number, options?: QueryOptions<any>): UseQueryResult<TData, ErrorType<unknown>> & { queryKey: QueryKey } {
  const sampleId = currentSampleIdFallback(id);
  const queryKey = getGetSampleQueryKey(sampleId);
  const queryOptions = { ...((options?.query as any) ?? {}) };
  if (String(id) === "NaN" && String(sampleId) !== "NaN") {
    queryOptions.enabled = true;
  }
  const query = useQuery({ queryKey, queryFn: () => getSample(sampleId), retry: false, ...queryOptions }) as any;
  return { ...query, queryKey };
}

async function createSampleWithInput(input: Record<string, unknown>) {
  const result = await client.models.Sample.create(input as any);
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
  return asSample(result.data);
}

export async function createSample({ data }: { data: CreateSampleRequest }): Promise<Sample> {
  const folderId = normalizeFolderId(data.folderId);
  const baseInput = cleanObject({
    sampleType: (data.sampleType || "rock") as any,
    sampleId: data.sampleId || `sample-${Date.now()}`,
    datasetId: folderId === null ? undefined : folderId,
    notes: data.notes || undefined,
  });

  try {
    return await createSampleWithInput(cleanObject({
      ...baseInput,
      fields: serializeFields(data.fields),
    }));
  } catch (firstError) {
    console.warn("GeoField full sample save failed; retrying without large media fields", firstError);
    return createSampleWithInput(cleanObject({
      ...baseInput,
      fields: serializeFields(stripLargeMediaFields(data.fields)),
    }));
  }
}
export function useCreateSample(options?: MutationOptions<Sample, { data: CreateSampleRequest }>) {
  return useMutation({ mutationFn: createSample, ...(options?.mutation as any) });
}

export async function updateSample({ id, data }: { id: string | number; data: UpdateSampleRequest }): Promise<Sample> {
  const folderId = normalizeFolderId(data.folderId);
  const sampleId = currentSampleIdFallback(id);
  const result = await client.models.Sample.update(cleanObject({
    id: String(sampleId),
    sampleId: data.sampleId,
    datasetId: data.folderId === undefined ? undefined : folderId,
    notes: data.notes || undefined,
    fields: data.fields === undefined ? undefined : serializeFields(data.fields),
  }));
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
  return asSample(result.data);
}
export function useUpdateSample(options?: MutationOptions<Sample, { id: string | number; data: UpdateSampleRequest }>) {
  return useMutation({ mutationFn: updateSample, ...(options?.mutation as any) });
}

export async function deleteSample({ id }: { id: string | number }): Promise<void> {
  const sampleId = currentSampleIdFallback(id);
  const result = await client.models.Sample.delete({ id: String(sampleId) });
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
}
export function useDeleteSample(options?: MutationOptions<void, { id: string | number }>) {
  return useMutation({ mutationFn: deleteSample, ...(options?.mutation as any) });
}

export async function moveSample({ id, data }: { id: string | number; data: MoveSampleRequest }): Promise<Sample> {
  return updateSample({ id, data: { folderId: data.folderId } });
}
export function useMoveSample(options?: MutationOptions<Sample, { id: string | number; data: MoveSampleRequest }>) {
  return useMutation({ mutationFn: moveSample, ...(options?.mutation as any) });
}
