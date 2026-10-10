/**
 * Frames: the places in a Deep Dive where Andrew's photos and videos go.
 *
 * Each Deep Dive lists its Frames in its Markdown front matter (`frames:`), and may place
 * one in its Body Text with a `<!-- frame: <slot> -->` line; the rest follow the Body
 * Text. A Frame's media is whatever file named `<slot>.<ext>` is in
 * `public/media/<deep dive>/`, found when the site is built, so adding a photo or video
 * needs no code changes. Without one, the Frame shows a placeholder naming the file it
 * wants. With the Grid on, Frames are walls in the Life Engine.
 */

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "gif"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov"];

/** The extensions a Frame's file may have, for the placeholder to name. */
export const FRAME_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];

export interface FrameMedia {
  readonly kind: "image" | "video";
  /** Its URL on the site. */
  readonly src: string;
}

/** Where a Deep Dive's media files go, relative to the repo root. */
export function mediaDir(deepDive: string): string {
  return `public/media/${deepDive}`;
}

/**
 * The media for Frame `slot` of Deep Dive `deepDive`, given the file names in its media
 * folder, or undefined if there isn't one yet. A video wins over a photo of the same name.
 */
export function frameMedia(deepDive: string, slot: string, files: readonly string[]): FrameMedia | undefined {
  const named = (extensions: readonly string[]) =>
    files.find((file) => {
      const dot = file.lastIndexOf(".");
      return dot > 0 && file.slice(0, dot) === slot && extensions.includes(file.slice(dot + 1).toLowerCase());
    });
  const video = named(VIDEO_EXTENSIONS);
  const file = video ?? named(IMAGE_EXTENSIONS);
  if (!file) return undefined;
  return {
    kind: video ? "video" : "image",
    src: `/media/${encodeURIComponent(deepDive)}/${encodeURIComponent(file)}`,
  };
}

export type BodyPart = { readonly html: string } | { readonly frame: string };

const MARKER = /<!--\s*frame:\s*([^\s>]+?)\s*-->/g;

/**
 * Split a Deep Dive's rendered Body Text at its `<!-- frame: <slot> -->` markers, so each
 * Frame goes where Andrew put it. Frames he didn't place follow the Body Text, in order.
 * Throws on a marker for a Frame that isn't listed, or one placed twice.
 */
export function placeFrames(html: string, slots: readonly string[]): BodyPart[] {
  const parts: BodyPart[] = [];
  const placed = new Set<string>();
  let from = 0;
  for (const match of html.matchAll(MARKER)) {
    const slot = match[1];
    if (!slots.includes(slot)) throw new Error(`Frame "${slot}" is placed in the Body Text but not listed in frames:`);
    if (placed.has(slot)) throw new Error(`Frame "${slot}" is placed twice`);
    placed.add(slot);
    if (match.index > from) parts.push({ html: html.slice(from, match.index) });
    parts.push({ frame: slot });
    from = match.index + match[0].length;
  }
  if (from < html.length) parts.push({ html: html.slice(from) });
  for (const slot of slots) if (!placed.has(slot)) parts.push({ frame: slot });
  return parts;
}
