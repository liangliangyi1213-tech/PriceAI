import type { PlatformAdapterId } from "./types";

const platformLabels: Record<PlatformAdapterId, string> = {
  mock: "Mock",
  jd: "京东",
  taobao: "淘宝",
  pdd: "拼多多",
};

export class PlatformAdapterError extends Error {
  readonly platform: PlatformAdapterId;
  readonly status: number | null;

  constructor(name: string, platform: PlatformAdapterId, message: string, status: number | null = null) {
    super(message);
    this.name = name;
    this.platform = platform;
    this.status = status;
  }
}

export class PlatformUnavailableError extends PlatformAdapterError {
  constructor(platform: PlatformAdapterId) {
    super("PlatformUnavailableError", platform, `${platformLabels[platform]}平台暂未接入。`);
  }
}

export class PlatformAuthError extends PlatformAdapterError {
  constructor(platform: PlatformAdapterId, status: number | null = null) {
    super("PlatformAuthError", platform, `${platformLabels[platform]}平台授权不可用。`, status);
  }
}

export class PlatformRateLimitError extends PlatformAdapterError {
  constructor(platform: PlatformAdapterId, status: number | null = 429) {
    super("PlatformRateLimitError", platform, `${platformLabels[platform]}平台请求频率受限，请稍后重试。`, status);
  }
}

export class PlatformRequestError extends PlatformAdapterError {
  constructor(platform: PlatformAdapterId, status: number | null = null) {
    super("PlatformRequestError", platform, `${platformLabels[platform]}平台请求失败，请稍后重试。`, status);
  }
}

function getStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const status = (error as Record<string, unknown>).status;
  return typeof status === "number" ? status : null;
}

/** Converts provider failures to public-safe errors without retaining raw response data. */
export function toSafePlatformError(platform: PlatformAdapterId, error: unknown): PlatformAdapterError {
  if (error instanceof PlatformAdapterError) return error;

  const status = getStatus(error);
  if (status === 401 || status === 403) return new PlatformAuthError(platform, status);
  if (status === 429) return new PlatformRateLimitError(platform, status);
  return new PlatformRequestError(platform, status);
}
