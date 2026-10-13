export interface TrendPoint {
  time: string;
  score: number;
  timestamp: string;
}

export function buildTrendPoints(input: Record<string, unknown>): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const [key, raw] of Object.entries(input)) {
    if (typeof raw === "number") {
      points.push({ time: key, score: raw, timestamp: key });
      continue;
    }
    if (Array.isArray(raw)) {
      raw.forEach((entry, index) => {
        if (typeof entry === "number")
          points.push({ time: `${key} ${index + 1}`, score: entry, timestamp: `${key}-${index}` });
        else if (entry && typeof entry === "object") {
          const item = entry as Record<string, unknown>;
          const score = Number(item["score"] ?? item["value"]);
          const timestamp = String(item["timestamp"] ?? item["time"] ?? `${key}-${index}`);
          if (Number.isFinite(score)) points.push({ time: timestamp, score, timestamp });
        }
      });
      continue;
    }
    if (raw && typeof raw === "object") {
      const item = raw as Record<string, unknown>;
      const score = Number(item["score"] ?? item["value"]);
      const timestamp = String(item["timestamp"] ?? item["time"] ?? key);
      if (Number.isFinite(score)) points.push({ time: timestamp, score, timestamp });
    }
  }
  return points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
