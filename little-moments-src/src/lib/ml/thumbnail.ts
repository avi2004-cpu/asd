import type { FrameSource } from "./types";
import { toDrawable } from "./source";

export async function captureGrayThumbnail(source: FrameSource, width = 96): Promise<Blob | null> {
  const drawable = await toDrawable(source);
  if (!drawable) return null;
  try {
    const height = Math.max(1, Math.round(width * (drawable.height / drawable.width || 1)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(drawable.image, 0, 0, width, height);

    const image = context.getImageData(0, 0, width, height);
    const pixels = image.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const gray = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
      pixels[index] = pixels[index + 1] = pixels[index + 2] = gray;
    }
    context.putImageData(image, 0, 0);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.6));
  } finally {
    drawable.dispose();
  }
}
