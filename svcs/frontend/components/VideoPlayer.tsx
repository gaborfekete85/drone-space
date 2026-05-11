"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

/**
 * HLS-capable video player.
 *
 *  - Chrome / Firefox / Edge → hls.js feeds segments via Media Source API.
 *  - Safari (and iOS WebView) → native HLS via `<video src=…>`.
 *
 * For our CloudFront-signed .m3u8 we have to re-attach the auth query string
 * (`Policy=…&Signature=…&Key-Pair-Id=…`) to every .ts request, because the
 * .ts URLs inside the manifest are relative paths and lose the params during
 * URL resolution. We do that with a small custom loader that appends the
 * same query string to each fragment / playlist load.
 *
 * `crossOrigin="anonymous"` makes the browser issue CORS-aware GETs from the
 * native video element (Safari path), so the manifest/segment responses must
 * carry `Access-Control-Allow-Origin`. CloudFront's `/stream/*` cache
 * behavior should reference a Response Headers Policy that adds those
 * headers (e.g. AWS managed `Managed-SimpleCORS`).
 */
export function VideoPlayer({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setError(null);

    // Anything after the "?" on the manifest URL — we re-attach it to each
    // segment fetch so CloudFront's signed-URL check passes.
    let authQs = "";
    try {
      authQs = new URL(src).search.replace(/^\?/, "");
    } catch {
      // src is malformed; let hls.js surface the error
    }

    const isHls = src.includes(".m3u8");

    if (isHls && Hls.isSupported()) {
      const BaseLoader = Hls.DefaultConfig.loader;
      class AuthLoader extends BaseLoader {
        load(
          context: Parameters<InstanceType<typeof BaseLoader>["load"]>[0],
          config: Parameters<InstanceType<typeof BaseLoader>["load"]>[1],
          callbacks: Parameters<InstanceType<typeof BaseLoader>["load"]>[2],
        ) {
          if (authQs && !context.url.includes("Signature=")) {
            const sep = context.url.includes("?") ? "&" : "?";
            context.url = `${context.url}${sep}${authQs}`;
          }
          super.load(context, config, callbacks);
        }
      }

      // Buffer-ahead tuning. Defaults (30s / 60 MB) stall on HD drone
      // footage where each 6-second .ts segment is ~95 MB — the byte cap
      // fills before even one segment is queued. The byte ceiling here is
      // intentionally large so a fast connection can keep buffering ahead.
      //
      // NOTE: no buffer setting can outrun a source whose effective bitrate
      // exceeds the viewer's downstream throughput. If playback still
      // stalls after the head-start runs out, the source needs to be
      // re-encoded at a lower bitrate (10–15 Mbps for 1080p is plenty).
      const hls = new Hls({
        loader: AuthLoader,
        maxBufferLength: 60,                // keep 60s ahead of playhead
        maxMaxBufferLength: 600,            // up to 10 min when bandwidth allows
        maxBufferSize: 1024 * 1024 * 1024,  // 1 GB byte cap (default 60 MB)
        backBufferLength: 30,               // keep last 30s for instant rewind
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        const msg = `${data.type}/${data.details}${data.response?.code ? ` (HTTP ${data.response.code})` : ""}${data.url ? ` — ${data.url}` : ""}`;
        // Log everything; only surface fatal errors in the UI so transient
        // segment retries (frequent on flaky networks) don't spam the user.
        // eslint-disable-next-line no-console
        console.warn("[hls.js]", msg, data);
        if (data.fatal) setError(msg);
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      return () => hls.destroy();
    }

    // Safari (or any browser advertising native HLS) handles the manifest
    // itself. Setting `src` directly works because Safari respects the
    // query string on segment requests when the manifest references peers
    // by relative path.
    if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    // Plain mp4 fallback.
    video.src = src;
  }, [src]);

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        controls
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        className={className ?? "w-full rounded-lg bg-black"}
      />
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-300">
          <span className="font-semibold">Player error:</span> {error}
        </div>
      )}
    </div>
  );
}

export default VideoPlayer;
