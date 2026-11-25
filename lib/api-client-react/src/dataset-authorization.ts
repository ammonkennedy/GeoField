type ApiError = { message?: string; errorType?: string };
type Result = { data?: unknown; errors?: readonly ApiError[] };
function denied(error: ApiError) {
  return /^(Unauthorized|UnauthorizedException|NotAuthorizedException)$/.test(error.errorType ?? '') || /not authorized|unauthorized|token.*expired/i.test(error.message ?? '');
}
/** Retry only an explicitly rejected mutation; never guess whether a network failure committed. */
export async function updateDatasetWithAuthorization<T extends Result>(
  request: (forceRefresh: boolean) => Promise<T>,
  label: string,
  operation: "update" | "delete" | "restore" = "update",
): Promise<T> {
  let result = await request(false);
  if (result.errors?.length && result.errors.every(denied) && !result.data) result = await request(true);
  if (result.errors?.length) {
    if (result.errors.some(denied)) {
      const error = new Error(`Cloud could not ${operation} project ${label} because access was denied. Your pending changes remain on this device. This is a project sync error; it does not confirm that a sample deletion failed. If you are already signed in to the owning account, the project may be unavailable or its cloud access needs to be checked.`);
      error.name = 'DatasetAccessDenied';
      throw error;
    }
    throw new Error(result.errors.map(error => error.message || 'Project update failed.').join('; '));
  }
  if (!result.data) throw new Error(`Cloud did not confirm ${operation} for project ${label}. Your pending changes remain on this device.`);
  return result;
}
