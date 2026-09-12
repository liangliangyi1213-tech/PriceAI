export type LiveImagePlatform = "taobao" | "pinduoduo";

/** A provider image that remains bound to one verified live listing. */
export type LiveListingImage = Readonly<{
  platform: LiveImagePlatform;
  externalProductId: string;
  url: string;
  alt: string;
}>;

const allowedImageHosts: Readonly<Record<LiveImagePlatform, ReadonlySet<string>>> = {
  taobao: new Set(["img.alicdn.com", "gw.alicdn.com", "ae01.alicdn.com"]),
  pinduoduo: new Set(["img.pddpic.com", "funimg.pddpic.com"]),
};

export type ProviderImageSource = Readonly<{ kind: string; url: string }>;

function safeProviderImageUrl(platform: LiveImagePlatform, value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return allowedImageHosts[platform].has(url.hostname.toLowerCase()) ? url.href : null;
  } catch {
    return null;
  }
}

/** Selects the first safe provider-owned URL while retaining its source field. */
export function selectProviderImageSource(
  platform: LiveImagePlatform,
  candidates: readonly Readonly<{ kind: string; url: string | null | undefined }>[],
): ProviderImageSource | null {
  for (const candidate of candidates) {
    const kind = candidate.kind.trim();
    const url = safeProviderImageUrl(platform, candidate.url);
    if (kind && url) return { kind, url };
  }
  return null;
}

export function selectLiveListingImage({
  platform,
  externalProductId,
  confirmedProductName,
  candidates,
}: {
  platform: LiveImagePlatform;
  externalProductId: string;
  confirmedProductName: string;
  candidates: readonly (string | null | undefined)[];
}): LiveListingImage | null {
  const listingId = externalProductId.trim();
  const alt = confirmedProductName.trim();
  if (!listingId || !alt) return null;
  const source = selectProviderImageSource(platform, candidates.map((url) => ({ kind: "listing_image", url })));
  return source ? { platform, externalProductId: listingId, url: source.url, alt } : null;
}

export function liveListingImageIdentity(image: LiveListingImage): string {
  return `${image.platform}:${image.externalProductId}:${image.url}`;
}

/** A failed identity resolves directly to neutral fallback; no second URL is retried. */
export function resolveRenderableLiveImage(image: LiveListingImage | null, failedIdentity: string | null): LiveListingImage | null {
  return image && liveListingImageIdentity(image) !== failedIdentity ? image : null;
}
