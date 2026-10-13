/** Anything the browser can read pixels from, including a camera-plugin data URL. */
export type FrameSource =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | string;

export interface FrameFeatures {
  gazeX: number;
  gazeY: number;
  expressionScore: number;
  expressionSource: "tfjs-emotion" | "blendshapes";
  t: number;
}

export interface SessionFeatures {
  schemaVersion: 1;
  expressionValues: number[];
  gazePoints: [number, number][];
  framesSeen: number;
  framesWithFace: number;
  expressionSource: FrameFeatures["expressionSource"] | "none";
  extractorVersion: string;
}
