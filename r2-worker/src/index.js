/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */


import { createHmac } from "node:crypto";

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      const signature = url.searchParams.get("sig"); 
      const expires = url.searchParams.get("exp") ;

      if (!validateToken(env, signature, expires)) {
        return new Response("Forbidden", { status: 403 });
      }

      const pathname = url.pathname;

      if (!pathname.startsWith("/video/") && !pathname.startsWith("/videos/")) {
        return new Response("Not found", { status: 404 });
      }

	  const key = decodeURIComponent(pathname.substring(1));
      const cache = caches.default;
      const cacheKey = new Request(request.url, request);
      let response = await cache.match(cacheKey);

      if (response) {
        return response;
      }

      const rangeHeader = request.headers.get("Range");

      const object = await env.BUCKET.get(key, {
        range: rangeHeader ? parseRange(rangeHeader) : undefined
      });

      if (!object) {
        return new Response(`Not found`, { status: 404 });
      }

      const headers = new Headers();

      headers.set("Content-Type", getContentType(key));
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cache-Control", "public, max-age=3600");

      if (rangeHeader && object.range) {
        headers.set(
          "Content-Range",
          `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`
        );
        headers.set("Accept-Ranges", "bytes");

        response = new Response(object.body, {
          status: 206,
          headers
        });
      } else {
        response = new Response(object.body, {
          status: 200,
          headers
        });
      }

      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;

    } catch (err) {
      return new Response("Internal Error: " + err.message + "\\n" + err.stack, { status: 500 });
    }
  }
};


function validateToken(env, signature, expires) {
  if (!signature || !expires) return false;

  return signature === createHmac("sha256", env.AUTH_SECRET)
	.update(`${env.WORKER_KEY}:${expires}`)
	.digest("hex") && Date.now() < parseInt(expires, 10);
}


function parseRange(rangeHeader) {
  const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);

  if (!match) return {};

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : undefined;

  return {
    offset: start,
    length: end ? end - start + 1 : undefined
  };
}


function getContentType(key) {
  if (key.endsWith(".mpd")) return "application/dash+xml";
  if (key.endsWith(".m4s")) return "video/mp4";
  if (key.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}