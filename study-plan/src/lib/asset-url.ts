export function resolveAssetUrl(value: string) {
  if (!value.startsWith("/")) return value;
  const base = process.env.ASSET_BASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}${value}` : value;
}
