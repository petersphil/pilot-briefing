/**
 * HTTP that works in Capacitor Android WebView.
 * Browser fetch to third-party APIs fails CORS; CapacitorHttp uses the native stack.
 */
import { Capacitor, CapacitorHttp } from "@capacitor/core";

export type NativeAwareInit = RequestInit & {
  /** When true, skip CapacitorHttp even on native (rare). */
  forceBrowserFetch?: boolean;
};

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

/**
 * fetch()-compatible helper. On Capacitor native platforms uses CapacitorHttp
 * so requests bypass WebView CORS. Elsewhere uses global fetch.
 */
export async function nativeAwareFetch(
  url: string,
  init: NativeAwareInit = {}
): Promise<Response> {
  const { forceBrowserFetch, ...rest } = init;
  const useNative =
    !forceBrowserFetch &&
    typeof Capacitor !== "undefined" &&
    Capacitor.isNativePlatform?.();

  if (!useNative) {
    return fetch(url, rest);
  }

  const method = (rest.method || "GET").toUpperCase();
  const headers = headersToRecord(rest.headers);
  let data: string | undefined;
  if (rest.body != null) {
    data = typeof rest.body === "string" ? rest.body : String(rest.body);
  }

  const result = await CapacitorHttp.request({
    url,
    method,
    headers,
    data,
    responseType: "text",
  });

  const body =
    typeof result.data === "string"
      ? result.data
      : result.data == null
        ? ""
        : JSON.stringify(result.data);

  return new Response(body, {
    status: result.status,
    headers: result.headers || {},
  });
}

export function isNativeApp(): boolean {
  try {
    return typeof Capacitor !== "undefined" && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Client briefing when static-export flag OR Capacitor native. */
export function shouldUseClientBriefing(): boolean {
  // Build-time flag (Capacitor static export) — safe during SSG
  if (process.env.NEXT_PUBLIC_CLIENT_BRIEFING === "1") return true;
  if (typeof window === "undefined") return false;
  return isNativeApp();
}
