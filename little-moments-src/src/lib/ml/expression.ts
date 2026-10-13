export interface EmotionProbs {
  angry: number;
  disgust: number;
  fear: number;
  happy: number;
  sad: number;
  surprise: number;
  neutral: number;
}

export interface Blendshape {
  categoryName: string;
  score: number;
}

export const FER_LABELS = [
  "angry",
  "disgust",
  "fear",
  "happy",
  "sad",
  "surprise",
  "neutral",
] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function compositeFromEmotions(emotions: EmotionProbs): number {
  const positive = emotions.happy + emotions.surprise;
  const negative = emotions.angry + emotions.sad + emotions.fear + emotions.disgust;
  return clamp01(0.5 + 0.5 * (positive - negative));
}

export function probsFromVector(values: ArrayLike<number>): EmotionProbs | null {
  if (values.length !== FER_LABELS.length) return null;
  const result = {} as EmotionProbs;
  FER_LABELS.forEach((label, index) => {
    result[label] = values[index] ?? 0;
  });
  return result;
}

export function compositeFromBlendshapes(shapes: readonly Blendshape[]): number {
  const scores = new Map(shapes.map((shape) => [shape.categoryName, shape.score]));
  const get = (name: string) => scores.get(name) ?? 0;
  const average = (first: string, second: string) => (get(first) + get(second)) / 2;
  const positive =
    average("mouthSmileLeft", "mouthSmileRight") +
    0.5 * Math.min(get("jawOpen"), get("browInnerUp"));
  const negative =
    average("mouthFrownLeft", "mouthFrownRight") +
    average("browDownLeft", "browDownRight") * 0.7 +
    average("noseSneerLeft", "noseSneerRight") * 0.7;
  return clamp01(0.5 + 0.5 * (positive - negative));
}
