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
  for (const candidate of candidates) {
    const url = safeProviderImageUrl(platform, candidate);
    if (url) return { platform, externalProductId: listingId, url, alt };
  }
  return null;
}

export function liveListingImageIdentity(image: LiveListingImage): string {
  return `${image.platform}:${image.externalProductId}:${image.url}`;
}

/** A failed identity resolves directly to neutral fallback; no second URL is retried. */
export function resolveRenderableLiveImage(image: LiveListingImage | null, failedIdentity: string | null): LiveListingImage | null {
  return image && liveListingImageIdentity(image) !== failedIdentity ? image : null;
}
