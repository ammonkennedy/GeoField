export function requiresCloudSignIn(error: unknown): boolean {
  if (error instanceof AggregateError) return error.errors.some(requiresCloudSignIn);
  return (error as { name?: string } | null)?.name === "CloudSignInRequired";
}

/** Retry connectivity, throttling, and service failures, never invalid data/auth. */
export function isRetryableSyncError(error: unknown): boolean {
  if (requiresCloudSignIn(error)) return false;
  if (error instanceof AggregateError) return error.errors.some((item) => isRetryableSyncError(item));
  const e = error as {
    name?: string;
    message?: string;
    status?: number;
    $metadata?: { httpStatusCode?: number };
  } | null;
  if (!e || e.name === "CloudSignInRequired") return false;
  const status = e.status ?? e.$metadata?.httpStatusCode;
  return (
    status === 429 ||
    (status !== undefined && status >= 500 && status <= 599) ||
    /NetworkError|TimeoutError|Throttling|TooManyRequests|ServiceUnavailable|InternalError/.test(
      e.name ?? "",
    ) ||
    /network|failed to fetch|load failed|waiting for a connection|timed? ?out|timeout|throttl|too many requests|service unavailable|connection.*(lost|failed|closed)/i.test(
      e.message ?? "",
    )
  );
}

/** Increasing delays with jitter, capped at two minutes while the app is open. */
export function syncRetryDelay(attempt: number, random = Math.random): number {
  return Math.round(
    Math.min(120_000, 5_000 * 2 ** Math.min(Math.max(attempt, 0), 5)) *
      (0.8 + random() * 0.2),
  );
}

/** Transport failures are an offline state, not rejected data or server errors. */
export function isConnectionUnavailable(error: unknown): boolean {
  if (error instanceof AggregateError) return error.errors.length > 0 && error.errors.every(isConnectionUnavailable);
  const e = error as { name?: string; message?: string; status?: number; $metadata?: { httpStatusCode?: number } } | null;
  if (!e || requiresCloudSignIn(error)) return false;
  const status = e.status ?? e.$metadata?.httpStatusCode;
  if (status && status >= 400) return false;
  return e.name === 'NetworkError' || /^(network error|network request failed|failed to fetch|load failed)$/i.test(e.message ?? '') ||
    /network is offline|waiting for a connection|cannot reach AWS sign-in|network connection.*(lost|failed)|internet.*(disconnected|offline)/i.test(e.message ?? '');
}
