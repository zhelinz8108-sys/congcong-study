import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type StorageError = { message: string };

function safeStorageSegment(value: string) {
  const normalized = value.replace(/[\\/]/g, "_").replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("Invalid storage path");
  }
  return normalized;
}

export function getStorageRoot() {
  const configured = process.env.STORAGE_ROOT?.trim();
  if (configured) return path.resolve(/*turbopackIgnore: true*/ configured);
  if (process.env.NODE_ENV === "production") return "/var/lib/study-plan/uploads";
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads");
}

export function getStorageFilePath(bucket: string, filename: string) {
  return path.join(
    /*turbopackIgnore: true*/ getStorageRoot(),
    safeStorageSegment(bucket),
    safeStorageSegment(filename),
  );
}

class LocalStorageBucket {
  constructor(private readonly bucket: string) {}

  async upload(
    filename: string,
    buffer: Buffer,
    options: { contentType?: string; upsert?: boolean } = {},
  ): Promise<{ data: { path: string } | null; error: StorageError | null }> {
    try {
      const safeBucket = safeStorageSegment(this.bucket);
      const safeFilename = safeStorageSegment(filename);
      const uploadDir = path.join(/*turbopackIgnore: true*/ getStorageRoot(), safeBucket);
      const fullPath = getStorageFilePath(safeBucket, safeFilename);

      if (!options.upsert) {
        try {
          await stat(/*turbopackIgnore: true*/ fullPath);
          return { data: null, error: { message: "File already exists" } };
        } catch {
          // File does not exist yet, so it is safe to create it.
        }
      }

      await mkdir(/*turbopackIgnore: true*/ uploadDir, { recursive: true });
      await writeFile(/*turbopackIgnore: true*/ fullPath, buffer);
      return { data: { path: safeFilename }, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: error instanceof Error ? error.message : "Upload failed" },
      };
    }
  }

  getPublicUrl(filename: string) {
    const safeBucket = safeStorageSegment(this.bucket);
    const safeFilename = safeStorageSegment(filename);
    const publicBase = process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
    return {
      data: {
        publicUrl: publicBase
          ? `${publicBase}/${encodeURIComponent(safeBucket)}/${encodeURIComponent(safeFilename)}`
          : `/api/files/${encodeURIComponent(safeBucket)}/${encodeURIComponent(safeFilename)}`,
      },
    };
  }
}

export const storage = {
  from(bucket: string) {
    return new LocalStorageBucket(bucket);
  },
};
