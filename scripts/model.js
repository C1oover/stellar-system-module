import { BODY_TYPES, ORBIT_MODES, deepClone, uid } from "./config.js";

export function normalizeSystem(system) {
  const clone = deepClone(system);
  clone.metadata ??= {};
  clone.bodies ??= [];

  const ids = new Set();
  clone.bodies = clone.bodies.filter((body) => {
    if (!body?.id || ids.has(body.id)) return false;
    ids.add(body.id);
    body.childrenIds ??= [];
    body.info ??= { summary: "", details: "" };
    body.orbit ??= { mode: ORBIT_MODES.ROOT };
    return true;
  });

  let root = clone.bodies.find((b) => b.type === BODY_TYPES.ROOT);
  if (!root) {
    root = {
      id: "root-system",
      type: BODY_TYPES.ROOT,
      name: "System Root",
      parentId: null,
      visible: false,
      childrenIds: [],
      mass: 1,
      radius: 1,
      color: 0xffffff,
      glow: 0,
      info: { summary: "", details: "" },
      orbit: { mode: ORBIT_MODES.ROOT, phase: 0 }
    };
    clone.bodies.unshift(root);
  }

  const map = new Map(clone.bodies.map((b) => [b.id, b]));
  for (const body of clone.bodies) body.childrenIds = [];
  for (const body of clone.bodies) {
    if (body.id === root.id) {
      body.parentId = null;
      body.orbit.mode = ORBIT_MODES.ROOT;
      continue;
    }
    if (!map.has(body.parentId)) body.parentId = root.id;
    map.get(body.parentId)?.childrenIds.push(body.id);
  }

  clone.metadata.uiState ??= { selectedId: null, showHud: true };
  clone.metadata.viewState ??= { focusId: null, stack: [] };
  clone.metadata.timeScale ??= 2400;
  clone.metadata.gravitationalConstant ??= 0.0045;
  return clone;
}

export function buildMaps(system) {
  const map = new Map(system.bodies.map((b) => [b.id, b]));
  const children = new Map(system.bodies.map((b) => [b.id, []]));
  for (const body of system.bodies) {
    if (body.parentId && children.has(body.parentId)) children.get(body.parentId).push(body.id);
  }
  return { map, children };
}

export function patchBody(system, bodyId, patch) {
  const clone = normalizeSystem(system);
  const body = clone.bodies.find((b) => b.id === bodyId);
  if (!body) return clone;
  foundry.utils.mergeObject(body, patch, { inplace: true, insertKeys: true, insertValues: true, overwrite: true });
  return normalizeSystem(clone);
}

export function updateMetadata(system, patch) {
  const clone = normalizeSystem(system);
  foundry.utils.mergeObject(clone.metadata, patch, { inplace: true, insertKeys: true, insertValues: true, overwrite: true });
  return clone;
}

export function createBody({ type, parentId, name, color = 0xffffff }) {
  return {
    id: uid(type),
    type,
    name,
    parentId,
    visible: type !== BODY_TYPES.BARYCENTER,
    childrenIds: [],
    mass: type === BODY_TYPES.STAR ? 250000 : type === BODY_TYPES.PLANET ? 250 : 20,
    radius: type === BODY_TYPES.STAR ? 56 : type === BODY_TYPES.PLANET ? 16 : 7,
    color,
    glow: type === BODY_TYPES.STAR ? 1 : 0,
    info: { summary: "", details: "" },
    orbit: {
      mode: type === BODY_TYPES.STAR && parentId === "root-system" ? ORBIT_MODES.STATIC : ORBIT_MODES.KEPLER,
      phase: 0,
      semiMajorAxis: type === BODY_TYPES.MOON ? 80 : 320,
      eccentricity: 0,
      clockwise: false,
      primaryId: parentId,
      secondaryId: null,
      figure8Scale: 150,
      inclination: 0,
      partnerId: null,
      binarySeparation: 0
    }
  };
}

export function addBody(system, body) {
  const clone = normalizeSystem(system);
  clone.bodies.push(body);
  return normalizeSystem(clone);
}

export function deleteBody(system, bodyId) {
  const clone = normalizeSystem(system);
  const doomed = new Set([bodyId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const body of clone.bodies) {
      if (doomed.has(body.parentId) && !doomed.has(body.id)) {
        doomed.add(body.id);
        changed = true;
      }
    }
  }
  clone.bodies = clone.bodies.filter((body) => !doomed.has(body.id));
  if (clone.metadata.uiState?.selectedId && doomed.has(clone.metadata.uiState.selectedId)) clone.metadata.uiState.selectedId = null;
  if (clone.metadata.viewState?.focusId && doomed.has(clone.metadata.viewState.focusId)) {
    clone.metadata.viewState.focusId = null;
    clone.metadata.viewState.stack = [];
  }
  return normalizeSystem(clone);
}

export function getBodyById(system, bodyId) {
  return system.bodies.find((b) => b.id === bodyId) ?? null;
}

export function getChildren(system, bodyId) {
  return system.bodies.filter((b) => b.parentId === bodyId);
}

export function canFocusInto(body) {
  return [BODY_TYPES.PLANET, BODY_TYPES.MOON, BODY_TYPES.STAR, BODY_TYPES.BARYCENTER].includes(body?.type);
}
