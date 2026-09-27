const pendingWrites = new Map<string, Promise<void>>();

function readLocalState<T>(storageKey: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalState<T>(storageKey: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

async function putCloudState<T>(scope: string, payload: T) {
  const response = await fetch(`/api/progress/${encodeURIComponent(scope)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
    cache: "no-store",
    keepalive: true,
  });
  if (!response.ok) throw new Error(`Cloud progress save failed: ${response.status}`);
}

export async function loadCloudState<T>(scope: string, storageKey: string, fallback: T) {
  const local = readLocalState(storageKey, fallback);

  try {
    const response = await fetch(`/api/progress/${encodeURIComponent(scope)}`, {
      cache: "no-store",
    });
    if (!response.ok) return local;

    const result = (await response.json()) as { payload: T | null };
    if (result.payload !== null && result.payload !== undefined) {
      writeLocalState(storageKey, result.payload);
      return result.payload;
    }

    await putCloudState(scope, local);
  } catch {
    // Offline use keeps working from the local mirror. The next write retries.
  }

  return local;
}

export function saveCloudState<T>(scope: string, storageKey: string, payload: T) {
  writeLocalState(storageKey, payload);

  const previous = pendingWrites.get(scope) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => putCloudState(scope, payload))
    .catch(() => undefined)
    .finally(() => {
      if (pendingWrites.get(scope) === next) pendingWrites.delete(scope);
    });
  pendingWrites.set(scope, next);
}

export async function updateCloudState<T>(
  scope: string,
  storageKey: string,
  fallback: T,
  update: (current: T) => T,
) {
  const current = await loadCloudState(scope, storageKey, fallback);
  const next = update(current);
  saveCloudState(scope, storageKey, next);
  return next;
}

export async function clearCloudState(scope: string, storageKey: string) {
  if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
  await fetch(`/api/progress/${encodeURIComponent(scope)}`, {
    method: "DELETE",
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
}
