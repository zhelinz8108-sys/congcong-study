export function localDataFallbackAllowed() {
  if (process.env.ALLOW_LOCAL_DATA_FALLBACK === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export function requireLocalDataFallback() {
  if (!localDataFallbackAllowed()) {
    throw new Error("Local data fallback is disabled in production");
  }
}
