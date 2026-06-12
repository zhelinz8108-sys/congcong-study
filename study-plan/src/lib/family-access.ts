import { createHmac, timingSafeEqual } from "node:crypto";

export const FAMILY_ACCESS_COOKIE = "congcong_family_access";
export const STUDENT_PROFILE_COOKIE = "congcong_student_profile";
export const FAMILY_ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

const tokenVersion = "v1";

export type StudentProfile = {
  id: string;
  name: string;
};

export const DEFAULT_STUDENT_PROFILE: StudentProfile = {
  id: "congcong",
  name: "聪聪",
};

type AccessCheck =
  | { allowed: true; configured: boolean; reason?: never }
  | {
      allowed: false;
      configured: boolean;
      reason: "missing" | "expired" | "invalid" | "unconfigured";
    };

function getSecret() {
  return (
    process.env.FAMILY_ACCESS_SECRET?.trim() ||
    process.env.FAMILY_ACCESS_PASSWORD?.trim() ||
    ""
  );
}

export function isFamilyAccessConfigured() {
  return Boolean(process.env.FAMILY_ACCESS_PASSWORD?.trim());
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  const secret = getSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyFamilyPassword(password: string) {
  const expected = process.env.FAMILY_ACCESS_PASSWORD?.trim() ?? "";
  if (!expected) return false;
  return safeEqual(password.trim(), expected);
}

export function createFamilyAccessToken(now = Date.now()) {
  const expiresAt = now + FAMILY_ACCESS_MAX_AGE * 1000;
  const payload = `${tokenVersion}.${expiresAt}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifyFamilyAccessToken(token?: string | null): AccessCheck {
  if (!isFamilyAccessConfigured()) {
    return process.env.NODE_ENV === "production"
      ? { allowed: false, configured: false, reason: "unconfigured" }
      : { allowed: true, configured: false };
  }

  if (!token) return { allowed: false, configured: true, reason: "missing" };

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== tokenVersion) {
    return { allowed: false, configured: true, reason: "invalid" };
  }

  const [, expiresAtText, signature] = parts;
  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return { allowed: false, configured: true, reason: "expired" };
  }

  const expected = signPayload(`${tokenVersion}.${expiresAtText}`);
  if (!expected || !safeEqual(signature, expected)) {
    return { allowed: false, configured: true, reason: "invalid" };
  }

  return { allowed: true, configured: true };
}

export function encodeStudentProfile(profile: StudentProfile) {
  return Buffer.from(JSON.stringify(profile)).toString("base64url");
}

export function parseStudentProfileCookie(value?: string | null): StudentProfile {
  if (!value) return DEFAULT_STUDENT_PROFILE;

  try {
    const parsed = JSON.parse(decodeBase64Url(value)) as Partial<StudentProfile>;
    const name =
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : DEFAULT_STUDENT_PROFILE.name;
    return {
      id: DEFAULT_STUDENT_PROFILE.id,
      name,
    };
  } catch {
    return DEFAULT_STUDENT_PROFILE;
  }
}

export function normalizeStudentProfile(input: unknown): StudentProfile {
  const data = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim().slice(0, 20)
      : DEFAULT_STUDENT_PROFILE.name;

  return {
    id: DEFAULT_STUDENT_PROFILE.id,
    name,
  };
}
