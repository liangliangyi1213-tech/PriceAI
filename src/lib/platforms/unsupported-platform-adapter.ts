import { PlatformUnavailableError } from "./errors";
import type { PlatformAdapter, PlatformAdapterId, PlatformSearchOptions, PlatformSearchResult } from "./types";

/** Explicit placeholder until an authorized, server-side marketplace integration is available. */
export class UnsupportedPlatformAdapter implements PlatformAdapter {
  constructor(readonly id: Exclude<PlatformAdapterId, "mock">) {}

  async searchProducts(query: string, options?: PlatformSearchOptions): Promise<PlatformSearchResult[]> {
    void query;
    void options;
    throw new PlatformUnavailableError(this.id);
  }
}

export class JdPlatformAdapter extends UnsupportedPlatformAdapter {
  constructor() {
    super("jd");
  }
}

export class TaobaoPlatformAdapter extends UnsupportedPlatformAdapter {
  constructor() {
    super("taobao");
  }
}
