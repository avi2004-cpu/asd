export interface Landmark {
  x: number;
  y: number;
}

const LEFT_IRIS = [468, 469, 470, 471] as const;
const LEFT_EYE_CORNERS = [33, 133] as const;
const LEFT_EYE_UPPER_LOWER = [159, 145] as const;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function gazeFromLandmarks(
  landmarks: readonly Landmark[],
  width: number,
  height: number,
): [number, number] | null {
  if (landmarks.length < 478) return null;

  const point = (index: number): [number, number] | null => {
    const landmark = landmarks[index];
    return landmark ? [landmark.x * width, landmark.y * height] : null;
  };

  const irisPoints = LEFT_IRIS.map(point);
  if (irisPoints.some((item) => item === null)) return null;
  const iris = irisPoints.filter((item): item is [number, number] => item !== null);
  const centerX = iris.reduce((sum, item) => sum + item[0], 0) / iris.length;
  const centerY = iris.reduce((sum, item) => sum + item[1], 0) / iris.length;

  const left = point(LEFT_EYE_CORNERS[0]);
  const right = point(LEFT_EYE_CORNERS[1]);
  const upper = point(LEFT_EYE_UPPER_LOWER[0]);
  const lower = point(LEFT_EYE_UPPER_LOWER[1]);
  if (!left || !right || !upper || !lower) return null;

  const eyeX = right[0] - left[0];
  const eyeY = right[1] - left[1];
  const eyeWidthSquared = eyeX * eyeX + eyeY * eyeY;
  if (eyeWidthSquared === 0) return null;

  const gazeX = ((centerX - left[0]) * eyeX + (centerY - left[1]) * eyeY) / eyeWidthSquared;
  const eyeHeight = Math.hypot(upper[0] - lower[0], upper[1] - lower[1]);
  const gazeY = eyeHeight > 0 ? (centerY - upper[1]) / eyeHeight : 0.5;
  return [clamp01(gazeX), clamp01(gazeY)];
}
