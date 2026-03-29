import { BODY_TYPES, ORBIT_MODES, DEFAULTS } from "./config.js";
import { buildMaps, normalizeSystem } from "./model.js";

function toVector(x = 0, y = 0) {
  return new PIXI.Point(x, y);
}

function add(a, b) {
  return new PIXI.Point(a.x + b.x, a.y + b.y);
}

function sub(a, b) {
  return new PIXI.Point(a.x - b.x, a.y - b.y);
}

function scale(v, s) {
  return new PIXI.Point(v.x * s, v.y * s);
}

function length(v) {
  return Math.hypot(v.x, v.y);
}

function sortedPairKey(a, b) {
  return [a, b].sort().join("::");
}

function solveEccentricAnomaly(meanAnomaly, eccentricity) {
  let E = meanAnomaly;
  for (let i = 0; i < 5; i += 1) {
    E -= (E - eccentricity * Math.sin(E) - meanAnomaly) / Math.max(0.0001, 1 - eccentricity * Math.cos(E));
  }
  return E;
}

export function computeMassMap(system) {
  const normalized = normalizeSystem(system);
  const { map, children } = buildMaps(normalized);
  const memo = new Map();

  function massOf(bodyId) {
    if (memo.has(bodyId)) return memo.get(bodyId);
    const body = map.get(bodyId);
    if (!body) return 0;
    let mass = Number(body.mass) || 0;
    if ([BODY_TYPES.ROOT, BODY_TYPES.BARYCENTER].includes(body.type)) {
      mass = 0;
      for (const childId of children.get(bodyId) ?? []) mass += massOf(childId);
      if (mass <= 0) mass = Number(body.mass) || 1;
    }
    memo.set(bodyId, mass);
    return mass;
  }

  for (const body of normalized.bodies) massOf(body.id);
  return memo;
}

export function computeSystemState(system, timeSeconds = 0) {
  const normalized = normalizeSystem(system);
  const { map, children } = buildMaps(normalized);
  const massMap = computeMassMap(normalized);
  const positions = new Map();
  const resolvedPairs = new Set();
  const G = Number(normalized.metadata.gravitationalConstant) || DEFAULTS.gravitationalConstant;
  const scaledTime = timeSeconds * ((Number(normalized.metadata.timeScale) || DEFAULTS.timeScale) / 1000);

  function mass(id) {
    return massMap.get(id) ?? 1;
  }

  function body(id) {
    return map.get(id) ?? null;
  }

  function parentPosition(b) {
    if (!b.parentId) return toVector(0, 0);
    return solveBody(b.parentId);
  }

  function orbitalSpeed(centerMass, orbitMass, radius) {
    const r = Math.max(radius, 0.001);
    return Math.sqrt((G * Math.max(centerMass + orbitMass, 1)) / (r * r * r));
  }

  function ellipseOffset(b, centerMass) {
    const a = Math.max(Number(b.orbit.semiMajorAxis) || 1, 1);
    const e = Math.min(Math.max(Number(b.orbit.eccentricity) || 0, 0), 0.8);
    const omega = orbitalSpeed(centerMass, mass(b.id), a);
    const dir = b.orbit.clockwise ? -1 : 1;
    const M = (Number(b.orbit.phase) || 0) + scaledTime * omega * dir;
    const E = solveEccentricAnomaly(M, e);
    const x = a * (Math.cos(E) - e);
    const bAxis = a * Math.sqrt(1 - e * e);
    const y = bAxis * Math.sin(E) * (1 - Math.abs(Number(b.orbit.inclination) || 0));
    return toVector(x, y);
  }

  function figure8Offset(b, primary, secondary) {
    const center = scale(add(primary, secondary), 0.5);
    const m = Math.max(mass(b.orbit.primaryId) + mass(b.orbit.secondaryId), 1);
    const s = Math.max(Number(b.orbit.figure8Scale) || Number(b.orbit.semiMajorAxis) || 140, 20);
    const omega = orbitalSpeed(m, mass(b.id), s);
    const theta = (Number(b.orbit.phase) || 0) + scaledTime * omega * (b.orbit.clockwise ? -1 : 1);
    const x = s * Math.sin(theta);
    const y = s * Math.sin(theta) * Math.cos(theta) * 0.75;
    return add(center, toVector(x, y));
  }

  function solveBinaryPair(b) {
    const partner = body(b.orbit.partnerId);
    if (!partner) return parentPosition(b);

    const key = sortedPairKey(b.id, partner.id);
    if (resolvedPairs.has(key)) return positions.get(b.id);

    const parent = parentPosition(b);
    const totalMass = Math.max(mass(b.id) + mass(partner.id), 1);
    const separation = Math.max(Number(b.orbit.binarySeparation) || Number(partner.orbit.binarySeparation) || Number(b.orbit.semiMajorAxis) * 2 || 40, 10);
    const omega = orbitalSpeed(totalMass, 0, separation);
    const theta = (Number(b.orbit.phase) || 0) + scaledTime * omega;

    const selfRadius = separation * (mass(partner.id) / totalMass);
    const partnerRadius = separation * (mass(b.id) / totalMass);

    const selfPos = add(parent, toVector(Math.cos(theta) * selfRadius, Math.sin(theta) * selfRadius));
    const partnerPos = add(parent, toVector(-Math.cos(theta) * partnerRadius, -Math.sin(theta) * partnerRadius));

    positions.set(b.id, selfPos);
    positions.set(partner.id, partnerPos);
    resolvedPairs.add(key);
    return positions.get(b.id);
  }

  function solveBody(bodyId) {
    if (positions.has(bodyId)) return positions.get(bodyId);
    const b = body(bodyId);
    if (!b) return toVector(0, 0);

    if (b.type === BODY_TYPES.ROOT || b.orbit.mode === ORBIT_MODES.ROOT) {
      const rootPos = toVector(0, 0);
      positions.set(bodyId, rootPos);
      return rootPos;
    }

    if (b.orbit.mode === ORBIT_MODES.STATIC) {
      const pos = parentPosition(b);
      positions.set(bodyId, pos);
      return pos;
    }

    if (b.orbit.mode === ORBIT_MODES.BINARY && b.orbit.partnerId) return solveBinaryPair(b);

    if (b.orbit.mode === ORBIT_MODES.FIGURE8 && b.orbit.primaryId && b.orbit.secondaryId) {
      const p1 = solveBody(b.orbit.primaryId);
      const p2 = solveBody(b.orbit.secondaryId);
      const pos = figure8Offset(b, p1, p2);
      positions.set(bodyId, pos);
      return pos;
    }

    const parent = parentPosition(b);
    let centerMass = b.parentId ? mass(b.parentId) : 1;
    if (b.orbit.primaryId && b.orbit.secondaryId) {
      centerMass = mass(b.orbit.primaryId) + mass(b.orbit.secondaryId);
    } else if (b.orbit.primaryId) {
      centerMass = mass(b.orbit.primaryId);
    }

    const offset = ellipseOffset(b, centerMass);
    const pos = add(parent, offset);
    positions.set(bodyId, pos);
    return pos;
  }

  for (const b of normalized.bodies) solveBody(b.id);

  return {
    positions,
    massMap,
    bodies: normalized.bodies,
    maps: { map, children },
    centerOf(bodyId) { return positions.get(bodyId) ?? toVector(0, 0); },
    orbitRadius(bodyId) {
      const b = body(bodyId);
      if (!b) return 0;
      if (b.orbit.mode === ORBIT_MODES.BINARY) return Number(b.orbit.binarySeparation) || Number(b.orbit.semiMajorAxis) || 0;
      if (b.orbit.mode === ORBIT_MODES.FIGURE8) return Number(b.orbit.figure8Scale) || 0;
      return Number(b.orbit.semiMajorAxis) || 0;
    }
  };
}

export function getFocusBounds(system, state, focusId) {
  const normalized = normalizeSystem(system);
  const { map, children } = buildMaps(normalized);
  const ids = new Set([focusId]);
  const queue = [focusId];
  while (queue.length) {
    const id = queue.shift();
    for (const child of children.get(id) ?? []) {
      ids.add(child);
      queue.push(child);
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of ids) {
    const b = map.get(id);
    const p = state.centerOf(id);
    const r = Math.max(Number(b?.radius) || 4, 6) * 3;
    minX = Math.min(minX, p.x - r);
    minY = Math.min(minY, p.y - r);
    maxX = Math.max(maxX, p.x + r);
    maxY = Math.max(maxY, p.y + r);
  }

  if (!Number.isFinite(minX)) return { x: -300, y: -300, width: 600, height: 600 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function distanceBetween(state, aId, bId) {
  return length(sub(state.centerOf(aId), state.centerOf(bId)));
}
