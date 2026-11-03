export class LedgerApiError extends Error {
  readonly status: number;
  readonly responseBody: unknown;

  constructor(method: string, path: string, status: number, body: unknown) {
    super(`${method} ${path} failed: ${status} ${JSON.stringify(body)}`);
    this.name = "LedgerApiError";
    this.status = status;
    this.responseBody = body;
  }
}

export async function ledgerJson<T>(
  jsonApiUrl: string,
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string>; timeoutMs?: number },
): Promise<T> {
  const response = await fetch(`${jsonApiUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json", ...init?.headers },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000),
  });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; }
  catch {
    if (response.ok) throw new Error(`${path} returned invalid JSON`);
    body = text;
  }
  if (!response.ok) {
    throw new LedgerApiError(init?.method ?? "GET", path, response.status, body);
  }
  return body as T;
}
