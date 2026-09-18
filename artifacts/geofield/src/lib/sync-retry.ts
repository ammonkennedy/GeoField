/** Retry connectivity, throttling, and service failures, never invalid data/auth. */
export function isRetryableSyncError(error: unknown): boolean {
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
