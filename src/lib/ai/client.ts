import "server-only";

import OpenAI from "openai";
import { fetch as undiciFetch, ProxyAgent } from "undici";

type OpenAIEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "HTTPS_PROXY" | "HTTP_PROXY" | "OPENAI_BASE_URL">
>;
type OpenAIClientOptions = NonNullable<ConstructorParameters<typeof OpenAI>[0]>;
const openAIEnvironment = process.env as OpenAIEnvironment;

export function resolveOpenAIProxyUrl(environment: OpenAIEnvironment = openAIEnvironment): string | undefined {
  return environment.HTTPS_PROXY?.trim() || environment.HTTP_PROXY?.trim() || undefined;
}

export function getOpenAIClientOptions(
  apiKey: string,
  environment: OpenAIEnvironment = openAIEnvironment,
): OpenAIClientOptions {
  const proxyUrl = resolveOpenAIProxyUrl(environment);
  const baseURL = environment.OPENAI_BASE_URL?.trim() || undefined;
  const baseOptions = baseURL ? { apiKey, baseURL } : { apiKey };

  if (!proxyUrl) return baseOptions;

  return {
    ...baseOptions,
    // Next.js wraps global fetch, so this must be paired with Undici's dispatcher.
    fetch: undiciFetch as unknown as NonNullable<OpenAIClientOptions["fetch"]>,
    fetchOptions: { dispatcher: new ProxyAgent(proxyUrl) },
  };
}

function getBaseURLHost(baseURL: string): string {
  try {
    return new URL(baseURL).hostname;
  } catch {
    return "invalid";
  }
}

/** Creates the server-side client only after the private key is available. */
export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API 未配置。");
  }

  const baseURLConfigured = Boolean(process.env.OPENAI_BASE_URL?.trim());
  const client = new OpenAI(getOpenAIClientOptions(apiKey));

  console.info(
    `[PriceAI][OpenAI] OPENAI_BASE_URL configured: ${baseURLConfigured}; baseURL host: ${getBaseURLHost(client.baseURL)}`,
  );

  return client;
}
