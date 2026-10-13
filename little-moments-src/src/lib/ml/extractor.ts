import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type * as TF from "@tensorflow/tfjs";
import { gazeFromLandmarks } from "./gaze";
import {
  compositeFromBlendshapes,
  compositeFromEmotions,
  probsFromVector,
} from "./expression";
import { toDrawable } from "./source";
import type { FrameFeatures, FrameSource } from "./types";

export interface MlConfig {
  wasmPath: string;
  faceLandmarkerModel: string;
  emotionModelUrl: string | null;
  emotionInput: { size: number; channels: 1 | 3 };
}

export const DEFAULT_ML_CONFIG: MlConfig = {
  wasmPath: "/mediapipe/wasm",
  faceLandmarkerModel: "/models/face_landmarker.task",
  emotionModelUrl: "/models/emotion/model.json",
  emotionInput: { size: 48, channels: 1 },
};

export const EXTRACTOR_VERSION = "mediapipe-tasks-vision@1.1.0";

let config = DEFAULT_ML_CONFIG;
let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let emotionPromise: Promise<TF.LayersModel | null> | null = null;
let emotionLoaded = false;

export function configureMl(overrides: Partial<MlConfig>) {
  config = { ...config, ...overrides };
  landmarkerPromise = null;
  emotionPromise = null;
  emotionLoaded = false;
}

export function currentExpressionSource(): "tfjs-emotion" | "blendshapes" {
  return emotionLoaded ? "tfjs-emotion" : "blendshapes";
}

function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(config.wasmPath);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: config.faceLandmarkerModel },
        runningMode: "IMAGE",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    })();
    landmarkerPromise.catch(() => {
      landmarkerPromise = null;
    });
  }
  return landmarkerPromise;
}

function getEmotionModel(): Promise<TF.LayersModel | null> {
  if (!config.emotionModelUrl) return Promise.resolve(null);
  if (!emotionPromise) {
    emotionPromise = (async () => {
      try {
        const tf = await import("@tensorflow/tfjs");
        const model = await tf.loadLayersModel(config.emotionModelUrl as string);
        emotionLoaded = true;
        return model;
      } catch (error) {
        console.warn("[ml] Emotion model unavailable; using blendshape fallback.", error);
        return null;
      }
    })();
  }
  return emotionPromise;
}

export async function warmUpMl(): Promise<void> {
  await Promise.all([getLandmarker(), getEmotionModel()]);
}

async function emotionScore(
  model: TF.LayersModel,
  image: CanvasImageSource,
  box: { x: number; y: number; width: number; height: number },
): Promise<number | null> {
  const tf = await import("@tensorflow/tfjs");
  const { size, channels } = config.emotionInput;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, size, size);

  const output = tf.tidy(() => {
    const input = tf.browser.fromPixels(canvas, channels).toFloat().div(255).expandDims(0);
    return model.predict(input) as TF.Tensor;
  });
  try {
    const probabilities = probsFromVector(await output.data());
    return probabilities ? compositeFromEmotions(probabilities) : null;
  } finally {
    output.dispose();
  }
}

export async function extractFeatures(source: FrameSource, t = 0): Promise<FrameFeatures | null> {
  const drawable = await toDrawable(source);
  if (!drawable) return null;
  try {
    const landmarker = await getLandmarker();
    const result = landmarker.detect(drawable.image);
    const landmarks = result.faceLandmarks[0];
    if (!landmarks) return null;

    const gaze = gazeFromLandmarks(landmarks, drawable.width, drawable.height);
    if (!gaze) return null;

    let expressionScore: number | null = null;
    let expressionSource: FrameFeatures["expressionSource"] = "blendshapes";
    const model = await getEmotionModel();
    if (model) {
      const xValues = landmarks.map((point) => point.x * drawable.width);
      const yValues = landmarks.map((point) => point.y * drawable.height);
      const x0 = Math.max(0, Math.min(...xValues));
      const y0 = Math.max(0, Math.min(...yValues));
      const width = Math.min(drawable.width, Math.max(...xValues)) - x0;
      const height = Math.min(drawable.height, Math.max(...yValues)) - y0;
      const pad = 0.1;
      const x = Math.max(0, x0 - width * pad);
      const y = Math.max(0, y0 - height * pad);
      const box = {
        x,
        y,
        width: Math.min(drawable.width - x, width * (1 + 2 * pad)),
        height: Math.min(drawable.height - y, height * (1 + 2 * pad)),
      };
      try {
        expressionScore = await emotionScore(model, drawable.image, box);
        if (expressionScore !== null) expressionSource = "tfjs-emotion";
      } catch (error) {
        console.warn("[ml] Emotion inference failed for this frame; using blendshapes.", error);
      }
    }
    if (expressionScore === null) {
      expressionScore = compositeFromBlendshapes(result.faceBlendshapes?.[0]?.categories ?? []);
      expressionSource = "blendshapes";
    }

    return { gazeX: gaze[0], gazeY: gaze[1], expressionScore, expressionSource, t };
  } finally {
    drawable.dispose();
  }
}
