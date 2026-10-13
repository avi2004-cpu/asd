import { extractFeatures, EXTRACTOR_VERSION } from "./extractor";
import { captureGrayThumbnail } from "./thumbnail";
import type { FrameSource, FrameFeatures, SessionFeatures } from "./types";

export class SessionFeatureCollector {
  private readonly startedAt = Date.now();
  private readonly expressionValues: number[] = [];
  private readonly gazePoints: [number, number][] = [];
  private framesSeen = 0;
  private readonly sources = new Set<FrameFeatures["expressionSource"]>();
  private thumbnail: Blob | null = null;
  private thumbnailTried = false;

  async addFrame(source: FrameSource): Promise<void> {
    this.framesSeen += 1;
    const features = await extractFeatures(source, Date.now() - this.startedAt);
    if (!features) return;
    this.expressionValues.push(features.expressionScore);
    this.gazePoints.push([features.gazeX, features.gazeY]);
    this.sources.add(features.expressionSource);
    if (!this.thumbnailTried) {
      this.thumbnailTried = true;
      this.thumbnail = await captureGrayThumbnail(source);
    }
  }

  async finish(): Promise<{ features: SessionFeatures; thumbnail: Blob | null }> {
    const expressionSource: SessionFeatures["expressionSource"] =
      this.sources.size === 0
        ? "none"
        : this.sources.size === 1
          ? (this.sources.values().next().value ?? "none")
          : "blendshapes";
    return {
      features: {
        schemaVersion: 1,
        expressionValues: this.expressionValues.map((value) => Math.round(value * 1000) / 1000),
        gazePoints: this.gazePoints.map(([x, y]) => [
          Math.round(x * 1000) / 1000,
          Math.round(y * 1000) / 1000,
        ]),
        framesSeen: this.framesSeen,
        framesWithFace: this.gazePoints.length,
        expressionSource,
        extractorVersion: EXTRACTOR_VERSION,
      },
      thumbnail: this.thumbnail,
    };
  }
}
