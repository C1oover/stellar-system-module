import { BODY_TYPES, DEFAULTS, VIEW_MODES, colorToHex, clamp } from "./config.js";
import { buildMaps, getChildren, normalizeSystem } from "./model.js";
import { computeSystemState, getFocusBounds } from "./physics.js";
import { makeRng } from "./defaults.js";

class StellarGlowFilter extends PIXI.Filter {
  constructor(color = 0xffffff, strength = 1) {
    super(
      undefined,
      `
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      uniform vec3 uColor;
      uniform float uGlow;
      uniform float uTime;
      void main(void) {
        vec4 base = texture2D(uSampler, vTextureCoord);
        vec2 p = (vTextureCoord - vec2(0.5)) * 2.0;
        float d = length(p);
        float core = smoothstep(1.0, 0.0, d);
        float pulse = 0.96 + 0.04 * sin(uTime * 0.75 + d * 10.0);
        float halo = pow(max(0.0, 1.15 - d), 2.4) * uGlow * pulse;
        vec3 rgb = max(base.rgb, uColor * (0.30 * core + halo));
        float a = max(base.a, halo * 0.60);
        gl_FragColor = vec4(rgb, a);
      }
      `,
      {
        uColor: new Float32Array([1, 1, 1]),
        uGlow: strength,
        uTime: 0
      }
    );
    this.padding = 80;
    this.setColor(color);
  }

  setColor(hex) {
    const c = PIXI.Color.shared.setValue(hex).toArray();
    this.uniforms.uColor[0] = c[0];
    this.uniforms.uColor[1] = c[1];
    this.uniforms.uColor[2] = c[2];
  }
}

export class SolarSystemRenderer {
  constructor({ getSystem, getLocalState, onBodyClick, onBodyHover } = {}) {
    this.getSystem = getSystem;
    this.getLocalState = getLocalState;
    this.onBodyClick = onBodyClick;
    this.onBodyHover = onBodyHover;
    this.root = null;
    this.background = null;
    this.orbits = null;
    this.world = null;
    this.labels = null;
    this.displayMap = new Map();
    this.ringMap = new Map();
    this.state = null;
    this.timeOrigin = performance.now();
    this.sceneOrigin = new PIXI.Point(0, 0);
    this._ticker = this._tick.bind(this);
  }

  mount() {
    if (!canvas?.ready || this.root) return;
    this.root = new PIXI.Container();
    this.root.sortableChildren = true;
    this.root.eventMode = "none";

    this.background = new PIXI.Container();
    this.orbits = new PIXI.Container();
    this.world = new PIXI.Container();
    this.labels = new PIXI.Container();

    this.root.addChild(this.background, this.orbits, this.world, this.labels);
    canvas.stage.addChild(this.root);
    canvas.app.ticker.add(this._ticker);
    this.refresh(true);
  }

  destroy() {
    if (!this.root) return;
    canvas.app.ticker.remove(this._ticker);
    this.root.destroy({ children: true });
    this.root = null;
    this.displayMap.clear();
    this.ringMap.clear();
    this.state = null;
  }

  refresh(forceRebuild = false) {
    if (!this.root) return;
    const system = normalizeSystem(this.getSystem?.() ?? { bodies: [], metadata: {} });
    this.system = system;
    if (forceRebuild) {
      this._drawBackground();
      this._rebuildBodies();
    }
  }

  _drawBackground() {
    this.background.removeChildren().forEach((c) => c.destroy?.());
    const g = new PIXI.Graphics();
    const bgColor = this.system?.metadata?.background?.color ?? 0x050816;
    const dims = canvas.dimensions;
    g.beginFill(bgColor, 1);
    g.drawRect(-dims.width, -dims.height, dims.width * 3, dims.height * 3);
    g.endFill();
    this.background.addChild(g);

    const rng = makeRng(this.system?.metadata?.seed ?? "stars");
    const stars = new PIXI.Graphics();
    const count = this.system?.metadata?.background?.starsDensity ?? 130;
    const spanX = dims.width * 2.6;
    const spanY = dims.height * 2.6;
    for (let i = 0; i < count; i += 1) {
      const x = (rng() - 0.5) * spanX;
      const y = (rng() - 0.5) * spanY;
      const r = rng() * 1.8 + 0.3;
      const alpha = 0.35 + rng() * 0.55;
      stars.beginFill(0xffffff, alpha);
      stars.drawCircle(x, y, r);
      stars.endFill();
    }
    this.background.addChild(stars);
  }

  _rebuildBodies() {
    this.world.removeChildren().forEach((c) => c.destroy?.({ children: true }));
    this.orbits.removeChildren().forEach((c) => c.destroy?.({ children: true }));
    this.labels.removeChildren().forEach((c) => c.destroy?.({ children: true }));
    this.displayMap.clear();
    this.ringMap.clear();

    for (const body of this.system.bodies) {
      if (!body.visible) continue;
      const display = this._createBodyDisplay(body);
      this.world.addChild(display.container);
      this.labels.addChild(display.label);
      this.displayMap.set(body.id, display);

      const orbitGraphic = new PIXI.Graphics();
      orbitGraphic.alpha = 0.28;
      this.orbits.addChild(orbitGraphic);
      this.ringMap.set(body.id, orbitGraphic);
    }
  }

  _createBodyDisplay(body) {
    const container = new PIXI.Container();
    container.zIndex = body.type === BODY_TYPES.STAR ? 50 : body.type === BODY_TYPES.PLANET ? 40 : 30;
    container.eventMode = "static";
    container.cursor = "pointer";

    if (body.type === BODY_TYPES.STAR) {
      const halo = new PIXI.Graphics();
      halo.beginFill(0xffffff, 1);
      halo.drawCircle(0, 0, body.radius * 0.96);
      halo.endFill();
      halo.filters = [new StellarGlowFilter(body.color, Number(body.glow) || 1)];
      container.addChild(halo);
    }

    const core = new PIXI.Graphics();
    core.beginFill(colorToHex(body.color), 1);
    core.drawCircle(0, 0, Math.max(body.radius, 4));
    core.endFill();
    container.addChild(core);

    if (body.type === BODY_TYPES.PLANET || body.type === BODY_TYPES.MOON) {
      const rim = new PIXI.Graphics();
      rim.lineStyle(1.5, 0xffffff, 0.25);
      rim.drawCircle(0, 0, Math.max(body.radius, 4));
      container.addChild(rim);
    }

    container.hitArea = new PIXI.Circle(0, 0, Math.max(body.radius * 1.8, 16));
    container.on("pointertap", (event) => this.onBodyClick?.(body, event));
    container.on("pointerover", () => this.onBodyHover?.(body, true));
    container.on("pointerout", () => this.onBodyHover?.(body, false));

    const label = new PIXI.Text({
      text: body.name,
      style: {
        fontSize: body.type === BODY_TYPES.STAR ? 18 : 14,
        fill: 0xe8eefc,
        stroke: 0x000000,
        strokeThickness: 3,
        fontFamily: "Signika"
      }
    });
    label.anchor.set(0.5, 0);
    label.alpha = 0.88;

    return { bodyId: body.id, body, container, core, label };
  }

  _visibleIds() {
    const focusId = this.getLocalState?.().focusId ?? null;
    const { map } = buildMaps(this.system);
    const visible = new Set();

    if (!focusId) {
      const walk = (id, planetaryDepth = 0) => {
        for (const child of getChildren(this.system, id)) {
          if (child.visible && [BODY_TYPES.STAR, BODY_TYPES.PLANET].includes(child.type)) visible.add(child.id);
          const nextPlanetaryDepth = planetaryDepth + (child.type === BODY_TYPES.PLANET ? 1 : 0);
          if (child.type === BODY_TYPES.MOON || nextPlanetaryDepth > 1) continue;
          walk(child.id, nextPlanetaryDepth);
        }
      };
      walk("root-system", 0);
      return visible;
    }

    const stack = [focusId];
    while (stack.length) {
      const id = stack.pop();
      const b = map.get(id);
      if (b?.visible) visible.add(id);
      for (const child of getChildren(this.system, id)) stack.push(child.id);
    }

    return visible;
  }

  _focusTransform() {
    const focusId = this.getLocalState?.().focusId ?? null;
    const dims = canvas.dimensions;
    this.sceneOrigin.set(dims.width / 2, dims.height / 2);

    if (!focusId || !this.state) {
      const systemBodies = this.system.bodies.filter((b) => [BODY_TYPES.STAR, BODY_TYPES.PLANET].includes(b.type));
      const maxR = Math.max(
        260,
        ...systemBodies.map((b) => {
          const p = this.state?.centerOf(b.id) ?? new PIXI.Point(0, 0);
          return Math.hypot(p.x, p.y) + (Number(b.radius) || 10) * 8;
        })
      );
      const scale = clamp(Math.min(dims.width, dims.height) / (maxR * 2.4), DEFAULTS.minZoom, 1);
      return {
        pivot: new PIXI.Point(0, 0),
        position: this.sceneOrigin.clone(),
        scale
      };
    }

    const bounds = getFocusBounds(this.system, this.state, focusId);
    const scale = clamp(Math.min(dims.width / Math.max(bounds.width, 180), dims.height / Math.max(bounds.height, 180)) * 0.54, 0.8, DEFAULTS.maxZoom);
    const center = new PIXI.Point(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return {
      pivot: center,
      position: this.sceneOrigin.clone(),
      scale
    };
  }

  _drawOrbit(body) {
    const orbit = this.ringMap.get(body.id);
    if (!orbit || !this.state) return;
    orbit.clear();
    if (!body.parentId || body.type === BODY_TYPES.STAR && body.parentId === "root-system" && !body.orbit.partnerId) return;

    const parentPos = this.state.centerOf(body.parentId);
    orbit.lineStyle(1, 0x9eb4de, 0.25);

    if (body.orbit.mode === "figure8") {
      const s = Math.max(Number(body.orbit.figure8Scale) || 120, 10);
      let first = true;
      for (let i = 0; i <= 80; i += 1) {
        const t = (i / 80) * Math.PI * 2;
        const x = s * Math.sin(t);
        const y = s * Math.sin(t) * Math.cos(t) * 0.75;
        if (first) orbit.moveTo(parentPos.x + x, parentPos.y + y);
        else orbit.lineTo(parentPos.x + x, parentPos.y + y);
        first = false;
      }
      return;
    }

    if (body.orbit.mode === "binary") {
      const partner = this.system.bodies.find((b) => b.id === body.orbit.partnerId);
      const total = Math.max((Number(body.mass) || 1) + (Number(partner?.mass) || 1), 1);
      const separation = Math.max(Number(body.orbit.binarySeparation) || Number(body.orbit.semiMajorAxis) * 2 || 40, 10);
      const selfRadius = separation * ((Number(partner?.mass) || 1) / total);
      orbit.drawCircle(parentPos.x, parentPos.y, selfRadius);
      return;
    }

    const a = Math.max(Number(body.orbit.semiMajorAxis) || 0, 0);
    if (a <= 0) return;
    const e = Math.max(Number(body.orbit.eccentricity) || 0, 0);
    const bAxis = a * Math.sqrt(1 - Math.min(e, 0.8) ** 2);
    orbit.drawEllipse(parentPos.x - a * e, parentPos.y, a, bAxis);
  }

  _tick() {
    if (!this.root || !canvas.ready) return;
    const system = normalizeSystem(this.getSystem?.() ?? { bodies: [], metadata: {} });
    if (JSON.stringify(system.metadata) !== JSON.stringify(this.system?.metadata) || system.bodies.length !== this.system?.bodies?.length) {
      this.system = system;
      this._drawBackground();
      this._rebuildBodies();
    } else {
      this.system = system;
    }

    const t = (performance.now() - this.timeOrigin) / 1000;
    this.state = computeSystemState(this.system, t);
    const visibleIds = this._visibleIds();

    for (const body of this.system.bodies) {
      const display = this.displayMap.get(body.id);
      if (!display) continue;
      const pos = this.state.centerOf(body.id);
      display.container.position.copyFrom(pos);
      display.label.position.set(pos.x, pos.y + Math.max(body.radius, 4) + 8);
      display.container.visible = visibleIds.has(body.id);
      display.label.visible = visibleIds.has(body.id);
      display.label.alpha = this.getLocalState?.().selectedId === body.id ? 1 : 0.82;

      const starHalo = display.container.children.find((c) => c.filters?.length);
      if (starHalo?.filters?.[0] instanceof StellarGlowFilter) {
        starHalo.filters[0].uniforms.uTime = t;
        starHalo.filters[0].uniforms.uGlow = Number(body.glow) || 1;
        starHalo.filters[0].setColor(body.color);
      }

      this._drawOrbit(body);
      const orbitGraphic = this.ringMap.get(body.id);
      if (orbitGraphic) orbitGraphic.visible = visibleIds.has(body.id) && body.parentId !== null;
    }

    const transform = this._focusTransform();
    this.world.pivot.copyFrom(transform.pivot);
    this.labels.pivot.copyFrom(transform.pivot);
    this.orbits.pivot.copyFrom(transform.pivot);

    this.world.position.copyFrom(transform.position);
    this.labels.position.copyFrom(transform.position);
    this.orbits.position.copyFrom(transform.position);

    this.world.scale.set(transform.scale);
    this.labels.scale.set(transform.scale);
    this.orbits.scale.set(transform.scale);
  }
}
