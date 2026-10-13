import type { FrameSource } from "./types";

export interface Drawable {
  image: Exclude<FrameSource, string>;
  width: number;
  height: number;
  dispose: () => void;
}

export async function toDrawable(source: FrameSource): Promise<Drawable | null> {
  if (typeof source === "string") {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not read sampled frame (${response.status}).`);
    const bitmap = await createImageBitmap(await response.blob());
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { image: source, width: source.width, height: source.height, dispose: () => {} };
  }
  if (source instanceof HTMLVideoElement) {
    if (source.readyState < 2 || !source.videoWidth) return null;
    return {
      image: source,
      width: source.videoWidth,
      height: source.videoHeight,
      dispose: () => {},
    };
  }
  if (source instanceof HTMLImageElement) {
    if (!source.complete || !source.naturalWidth) return null;
    return {
      image: source,
      width: source.naturalWidth,
      height: source.naturalHeight,
      dispose: () => {},
    };
  }
  return { image: source, width: source.width, height: source.height, dispose: () => {} };
}
