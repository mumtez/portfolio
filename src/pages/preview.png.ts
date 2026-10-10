/** The link preview image, rendered at build time to `/preview.png`. */
import type { APIRoute } from "astro";
import { renderPreviewImage } from "../lib/preview-image";

export const GET: APIRoute = () =>
  new Response(new Uint8Array(renderPreviewImage()), { headers: { "Content-Type": "image/png" } });
