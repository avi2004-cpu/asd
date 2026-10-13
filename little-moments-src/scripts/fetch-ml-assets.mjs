import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const wasmSource = path.join(
  projectDirectory,
  "node_modules",
  "@mediapipe",
  "tasks-vision",
  "wasm",
);
const wasmTarget = path.join(projectDirectory, "public", "mediapipe", "wasm");
const modelTarget = path.join(projectDirectory, "public", "models", "face_landmarker.task");
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

try {
  await stat(wasmSource);
} catch {
  throw new Error("Install npm dependencies before fetching the on-device ML assets.");
}

await mkdir(wasmTarget, { recursive: true });
await cp(wasmSource, wasmTarget, { recursive: true });
await mkdir(path.dirname(modelTarget), { recursive: true });
const temporaryModel = `${modelTarget}.download`;
try {
  const response = await fetch(modelUrl);
  if (!response.ok) {
    throw new Error(`Face Landmarker download failed (${response.status}).`);
  }
  await (await import("node:fs/promises")).writeFile(
    temporaryModel,
    new Uint8Array(await response.arrayBuffer()),
  );
  await rm(modelTarget, { force: true });
  await rename(temporaryModel, modelTarget);
} catch (error) {
  await rm(temporaryModel, { force: true });
  throw error;
}

console.log("Installed MediaPipe WASM and Face Landmarker assets under public/.");
console.log("Optional: add a compatible FER TF.js model under public/models/emotion/.");
