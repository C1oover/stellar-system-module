export const MODULE_ID = "generic-solar-system";
export const FLAG_SCOPE = MODULE_ID;
export const FLAG_KEY = "sceneConfig";

export const BODY_TYPES = {
  ROOT: "root",
  BARYCENTER: "barycenter",
  STAR: "star",
  PLANET: "planet",
  MOON: "moon"
};

export const ORBIT_MODES = {
  ROOT: "root",
  STATIC: "static",
  KEPLER: "kepler",
  BINARY: "binary",
  FIGURE8: "figure8"
};

export const VIEW_MODES = {
  SYSTEM: "system",
  FOCUS: "focus"
};

export const DEFAULTS = {
  timeScale: 2400,
  gravitationalConstant: 0.0045,
  scenePadding: 220,
  minZoom: 0.35,
  maxZoom: 6,
  baseUiWidth: 370,
  syncTolerance: 0.001
};

export function getFlag(scene = canvas?.scene) {
  return scene?.getFlag(FLAG_SCOPE, FLAG_KEY) ?? null;
}

export async function setFlag(data, scene = canvas?.scene) {
  if (!scene) return;
  return scene.setFlag(FLAG_SCOPE, FLAG_KEY, data);
}

export function deepClone(obj) {
  return foundry.utils.deepClone(obj);
}

export function uid(prefix = "body") {
  return `${prefix}-${foundry.utils.randomID()}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function colorToHex(color) {
  return typeof color === "number" ? color : Number(PIXI.utils.string2hex(color ?? "#ffffff"));
}

export function hexToString(value) {
  if (typeof value === "string") return value;
  return `#${PIXI.utils.hex2string(value).replace("#", "")}`;
}
