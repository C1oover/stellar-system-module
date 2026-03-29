const MODULE_ID = "stellar-system-module";
const FLAG_KEY = "solarSystem";
const EDITOR_ID = `${MODULE_ID}-editor`;

const DEFAULT_SYSTEM = {
  version: 2,
  enabled: false,
  animationSpeed: 1,
  backgroundColor: "#040816",
  showLabels: true,
  showOrbits: true,
  starfieldDensity: 90,
  bodies: []
};

const OVERLAYS = new Map();
let gmLauncher = null;

Hooks.once("init", async () => {
  await loadTemplates([`modules/${MODULE_ID}/templates/editor.hbs`]);

  game.keybindings.register(MODULE_ID, "openEditor", {
    name: "Open Solar System Editor",
    editable: [{ key: "KeyO", modifiers: ["Control", "Shift"] }],
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
    onDown: () => {
      SolarSystemEditor.openForScene(canvas?.scene);
      return true;
    }
  });

  game.modules.get(MODULE_ID).api = {
    getSceneSystem: (scene = canvas?.scene) => getSolarSystem(scene),
    ensureSceneSystem: (scene = canvas?.scene) => ensureSolarSystem(scene),
    openEditor: (scene = canvas?.scene) => SolarSystemEditor.openForScene(scene),
    applyPreset: async (scene = canvas?.scene, preset = "single") => {
      const data = preset === "binary" ? buildBinaryPreset(scene) : buildSinglePreset(scene);
      await scene?.setFlag(MODULE_ID, FLAG_KEY, data);
      return data;
    }
  };
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;
  const target = controls.tokens ?? controls.notes ?? Object.values(controls)[0];
  if (!target?.tools) return;
  target.tools.stellarSystemEditor = {
    name: "stellarSystemEditor",
    title: "Open Solar System Editor",
    icon: "fa-solid fa-star",
    order: Object.keys(target.tools).length,
    button: true,
    visible: true,
    onChange: () => SolarSystemEditor.openForScene(canvas?.scene)
  };
});

Hooks.on("renderSceneConfig", (app, html) => {
  if (!game.user?.isGM) return;
  const footer = html.find("footer");
  if (!footer.length || html.find(`.${MODULE_ID}-config-open`).length) return;
  const button = $(`<button type="button" class="${MODULE_ID}-config-open"><i class="fa-solid fa-star"></i> Solar System Editor</button>`);
  button.on("click", () => SolarSystemEditor.openForScene(app.object));
  footer.prepend(button);
});

Hooks.once("ready", () => {
  if (!game.user?.isGM) return;
  ensureLauncher();
});

Hooks.on("canvasReady", () => {
  ensureLauncher();
  refreshOverlay();
});
Hooks.on("canvasTearDown", () => teardownOverlay(canvas?.scene?.id));
Hooks.on("deleteScene", (scene) => teardownOverlay(scene.id));
Hooks.on("updateScene", (scene, changed) => {
  if (scene.id !== canvas?.scene?.id) return;
  if (foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.${FLAG_KEY}`)) {
    refreshOverlay();
    SolarSystemEditor.instance?.refreshIfScene(scene);
  }
});

function ensureLauncher() {
  if (!game.user?.isGM) return;
  if (!gmLauncher) {
    gmLauncher = document.createElement("button");
    gmLauncher.type = "button";
    gmLauncher.className = `${MODULE_ID}-launcher`;
    gmLauncher.innerHTML = '<i class="fa-solid fa-star"></i><span>Solar</span>';
    gmLauncher.addEventListener("click", () => SolarSystemEditor.openForScene(canvas?.scene));
    document.body.appendChild(gmLauncher);
  }
  gmLauncher.style.display = canvas?.scene ? "flex" : "none";
}

function refreshOverlay() {
  const scene = canvas?.scene;
  if (!scene) return;
  teardownOverlay(scene.id);
  const data = getSolarSystem(scene);
  if (!data?.enabled) return;
  const overlay = new SolarSystemOverlay(scene, data);
  OVERLAYS.set(scene.id, overlay);
  overlay.attach();
}

function teardownOverlay(sceneId) {
  const overlay = OVERLAYS.get(sceneId);
  if (!overlay) return;
  overlay.destroy();
  OVERLAYS.delete(sceneId);
}

function getSolarSystem(scene) {
  if (!scene) return foundry.utils.deepClone(DEFAULT_SYSTEM);
  const raw = scene.getFlag(MODULE_ID, FLAG_KEY) ?? DEFAULT_SYSTEM;
  return normalizeSystemData(foundry.utils.deepClone(raw));
}

function ensureSolarSystem(scene) {
  const data = getSolarSystem(scene);
  if (!scene) return data;
  if (!scene.getFlag(MODULE_ID, FLAG_KEY)) scene.setFlag(MODULE_ID, FLAG_KEY, data);
  return data;
}

function normalizeSystemData(data) {
  const merged = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_SYSTEM), data, { inplace: false, insertKeys: true, insertValues: true, overwrite: true });
  merged.bodies = Array.isArray(merged.bodies) ? merged.bodies.map(normalizeBodyData) : [];
  return merged;
}

function normalizeBodyData(body) {
  const defaults = {
    id: foundry.utils.randomID(),
    name: "Body",
    type: "planet",
    color: "#8ecae6",
    radius: 16,
    glow: 1,
    description: "",
    journalUuid: "",
    parentId: null,
    orbitTarget: null,
    orbitMode: "ellipse",
    orbitRadiusX: 180,
    orbitRadiusY: 180,
    orbitPeriod: 30,
    orbitPhase: 0,
    pairId: "",
    pairDistance: 20,
    pairPeriod: 6,
    pairPhase: 0,
    binaryGroup: "",
    binarySeparation: 160,
    binaryPeriod: 20,
    binaryPhase: 0,
    showLabel: true
  };
  const out = foundry.utils.mergeObject(defaults, body ?? {}, { inplace: false, overwrite: true, insertKeys: true, insertValues: true });
  out.radius = Number(out.radius ?? defaults.radius);
  out.glow = Number(out.glow ?? defaults.glow);
  out.orbitRadiusX = Number(out.orbitRadiusX ?? defaults.orbitRadiusX);
  out.orbitRadiusY = Number(out.orbitRadiusY ?? defaults.orbitRadiusY);
  out.orbitPeriod = Number(out.orbitPeriod ?? defaults.orbitPeriod);
  out.orbitPhase = Number(out.orbitPhase ?? defaults.orbitPhase);
  out.pairDistance = Number(out.pairDistance ?? defaults.pairDistance);
  out.pairPeriod = Number(out.pairPeriod ?? defaults.pairPeriod);
  out.pairPhase = Number(out.pairPhase ?? defaults.pairPhase);
  out.binarySeparation = Number(out.binarySeparation ?? defaults.binarySeparation);
  out.binaryPeriod = Number(out.binaryPeriod ?? defaults.binaryPeriod);
  out.binaryPhase = Number(out.binaryPhase ?? defaults.binaryPhase);
  return out;
}

function buildSinglePreset(scene) {
  const starId = foundry.utils.randomID();
  const janusId = foundry.utils.randomID();
  const tethysId = foundry.utils.randomID();
  const pairId = `pair-${foundry.utils.randomID()}`;
  return normalizeSystemData({
    enabled: true,
    backgroundColor: "#060816",
    animationSpeed: 1,
    showLabels: true,
    showOrbits: true,
    starfieldDensity: 100,
    bodies: [
      {
        id: starId,
        name: scene?.name ? `${scene.name} Prime` : "Primary Star",
        type: "star",
        color: "#f5c764",
        radius: 42,
        glow: 1.25,
        orbitMode: "static"
      },
      {
        id: foundry.utils.randomID(),
        name: "Aurelia",
        type: "planet",
        color: "#74b9ff",
        radius: 13,
        orbitTarget: starId,
        orbitMode: "ellipse",
        orbitRadiusX: 150,
        orbitRadiusY: 130,
        orbitPeriod: 16,
        orbitPhase: 0.3,
        description: "Temperate inner world."
      },
      {
        id: foundry.utils.randomID(),
        name: "Vesta",
        type: "planet",
        color: "#f0c8a0",
        radius: 10,
        orbitTarget: starId,
        orbitMode: "ellipse",
        orbitRadiusX: 240,
        orbitRadiusY: 220,
        orbitPeriod: 28,
        orbitPhase: 1.7
      },
      {
        id: janusId,
        name: "Janus",
        type: "planet",
        color: "#9fd18b",
        radius: 15,
        orbitTarget: starId,
        orbitMode: "ellipse",
        orbitRadiusX: 320,
        orbitRadiusY: 300,
        orbitPeriod: 40,
        orbitPhase: 0.8,
        pairId,
        pairDistance: 26,
        pairPeriod: 4,
        pairPhase: 0
      },
      {
        id: tethysId,
        name: "Tethys",
        type: "planet",
        color: "#b7b0ff",
        radius: 15,
        orbitTarget: starId,
        orbitMode: "ellipse",
        orbitRadiusX: 320,
        orbitRadiusY: 300,
        orbitPeriod: 40,
        orbitPhase: 0.8,
        pairId,
        pairDistance: 26,
        pairPeriod: 4,
        pairPhase: Math.PI
      },
      {
        id: foundry.utils.randomID(),
        name: "Helene",
        type: "moon",
        color: "#d7d7e6",
        radius: 6,
        parentId: janusId,
        orbitTarget: janusId,
        orbitMode: "ellipse",
        orbitRadiusX: 34,
        orbitRadiusY: 26,
        orbitPeriod: 3.2,
        orbitPhase: 0.6,
        showLabel: false
      }
    ]
  });
}

function buildBinaryPreset(scene) {
  const group = `binary-${foundry.utils.randomID()}`;
  const starA = foundry.utils.randomID();
  const starB = foundry.utils.randomID();
  const outerPair = `pair-${foundry.utils.randomID()}`;
  const kepler = foundry.utils.randomID();
  return normalizeSystemData({
    enabled: true,
    backgroundColor: "#040714",
    animationSpeed: 1,
    showLabels: true,
    showOrbits: true,
    starfieldDensity: 120,
    bodies: [
      {
        id: starA,
        name: scene?.name ? `${scene.name} A` : "Twin A",
        type: "star",
        color: "#ffd27a",
        radius: 32,
        glow: 1.1,
        binaryGroup: group,
        binarySeparation: 170,
        binaryPeriod: 24,
        binaryPhase: 0,
        orbitMode: "static"
      },
      {
        id: starB,
        name: scene?.name ? `${scene.name} B` : "Twin B",
        type: "star",
        color: "#ffb7a5",
        radius: 26,
        glow: 1.08,
        binaryGroup: group,
        binarySeparation: 170,
        binaryPeriod: 24,
        binaryPhase: Math.PI,
        orbitMode: "static"
      },
      {
        id: kepler,
        name: "Kepler",
        type: "planet",
        color: "#7ab8ff",
        radius: 15,
        orbitTarget: `binary:${group}`,
        orbitMode: "ellipse",
        orbitRadiusX: 260,
        orbitRadiusY: 210,
        orbitPeriod: 30,
        orbitPhase: 0.4,
        description: "Circumbinary frontier world."
      },
      {
        id: foundry.utils.randomID(),
        name: "Mimas",
        type: "moon",
        color: "#d8dde6",
        radius: 7,
        parentId: kepler,
        orbitTarget: kepler,
        orbitMode: "ellipse",
        orbitRadiusX: 34,
        orbitRadiusY: 28,
        orbitPeriod: 5,
        orbitPhase: 0.2,
        showLabel: false
      },
      {
        id: foundry.utils.randomID(),
        name: "Janos",
        type: "planet",
        color: "#b6f19f",
        radius: 12,
        orbitTarget: `binary:${group}`,
        orbitMode: "figure8",
        orbitRadiusX: 160,
        orbitRadiusY: 120,
        orbitPeriod: 18,
        orbitPhase: 0.1,
        description: "Figure-eight test orbit."
      },
      {
        id: foundry.utils.randomID(),
        name: "Rhea",
        type: "planet",
        color: "#d0a0ff",
        radius: 13,
        orbitTarget: starA,
        orbitMode: "ellipse",
        orbitRadiusX: 104,
        orbitRadiusY: 90,
        orbitPeriod: 12,
        orbitPhase: 1.6,
        pairId: outerPair,
        pairDistance: 24,
        pairPeriod: 3.2,
        pairPhase: 0.2
      },
      {
        id: foundry.utils.randomID(),
        name: "Dione",
        type: "planet",
        color: "#8ef0de",
        radius: 13,
        orbitTarget: starA,
        orbitMode: "ellipse",
        orbitRadiusX: 104,
        orbitRadiusY: 90,
        orbitPeriod: 12,
        orbitPhase: 1.6,
        pairId: outerPair,
        pairDistance: 24,
        pairPeriod: 3.2,
        pairPhase: Math.PI + 0.2
      }
    ]
  });
}

class SolarSystemEditor extends Application {
  static instance = null;

  static openForScene(scene) {
    if (!scene) {
      ui.notifications?.warn("No active scene available.");
      return;
    }
    if (SolarSystemEditor.instance?.rendered) {
      SolarSystemEditor.instance.scene = scene;
      SolarSystemEditor.instance.render(true);
      return SolarSystemEditor.instance;
    }
    SolarSystemEditor.instance = new SolarSystemEditor(scene);
    return SolarSystemEditor.instance.render(true);
  }

  constructor(scene, options = {}) {
    super(options);
    this.scene = scene;
    const firstBody = getSolarSystem(scene).bodies[0];
    this.selectedBodyId = firstBody?.id ?? null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: EDITOR_ID,
      title: "Solar System Editor",
      template: `modules/${MODULE_ID}/templates/editor.hbs`,
      width: 700,
      height: 880,
      resizable: true,
      classes: [MODULE_ID, "solar-system-editor"],
      popOut: true
    });
  }

  getData() {
    const system = getSolarSystem(this.scene);
    if (!this.selectedBodyId && system.bodies.length) this.selectedBodyId = system.bodies[0].id;
    const selectedBody = system.bodies.find((b) => b.id === this.selectedBodyId) ?? null;
    const binaryGroups = Array.from(new Set(system.bodies.filter((b) => b.type === "star" && b.binaryGroup).map((b) => b.binaryGroup)));
    return {
      sceneName: this.scene?.name,
      system,
      selectedBody,
      hasSelectedBody: !!selectedBody,
      selectedIsStar: selectedBody?.type === "star",
      selectedIsNotStar: selectedBody && selectedBody.type !== "star",
      bodyList: system.bodies.map((body) => ({ id: body.id, name: `${iconForType(body.type)} ${body.name}`, selected: body.id === this.selectedBodyId })),
      bodyTypeOptions: ["star", "planet", "moon"].map((value) => ({ value, label: capitalize(value), selected: selectedBody?.type === value })),
      orbitModeOptions: [
        { value: "ellipse", label: "Ellipse" },
        { value: "figure8", label: "Figure 8" },
        { value: "static", label: "Static / Centered" }
      ].map((option) => ({ ...option, selected: selectedBody?.orbitMode === option.value })),
      parentOptions: [
        { value: "", label: "None", selected: !selectedBody?.parentId },
        ...system.bodies.filter((b) => b.id !== selectedBody?.id && b.type !== "moon").map((b) => ({ value: b.id, label: `${b.name} (${b.type})`, selected: selectedBody?.parentId === b.id }))
      ],
      targetOptions: [
        { value: "", label: "None", selected: !selectedBody?.orbitTarget },
        ...system.bodies.filter((b) => b.id !== selectedBody?.id).map((b) => ({ value: b.id, label: `${b.name} (${b.type})`, selected: selectedBody?.orbitTarget === b.id })),
        ...binaryGroups.map((group) => ({ value: `binary:${group}`, label: `Binary barycenter: ${group}`, selected: selectedBody?.orbitTarget === `binary:${group}` }))
      ]
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='autopopulate-single']").on("click", () => this._applyPreset("single"));
    html.find("[data-action='autopopulate-binary']").on("click", () => this._applyPreset("binary"));
    html.find("[data-action='enable-system']").on("change", (event) => this._updateSystemFlag(event.currentTarget.checked));
    html.find("[data-action='select-body']").on("click", (event) => {
      this.selectedBodyId = event.currentTarget.dataset.bodyId;
      this.render(true);
    });
    html.find("[data-action='add-star']").on("click", () => this._addBody("star"));
    html.find("[data-action='add-planet']").on("click", () => this._addBody("planet"));
    html.find("[data-action='add-moon']").on("click", () => this._addBody("moon"));
    html.find("[data-action='delete-body']").on("click", () => this._deleteSelectedBody());

    const form = html.find("form")[0];
    const save = foundry.utils.debounce(() => this._saveForm(form), 80);
    html.find("input, select, textarea").on("input change", save);
    html.find("input[type='color']").on("change", () => this._saveForm(form));
  }

  async _applyPreset(preset) {
    const data = preset === "binary" ? buildBinaryPreset(this.scene) : buildSinglePreset(this.scene);
    this.selectedBodyId = data.bodies[0]?.id ?? null;
    await this.scene.setFlag(MODULE_ID, FLAG_KEY, data);
    this.render(true);
  }

  async _updateSystemFlag(enabled) {
    const current = getSolarSystem(this.scene);
    current.enabled = enabled;
    await this.scene.setFlag(MODULE_ID, FLAG_KEY, current);
  }

  async _saveForm(form) {
    if (!form) return;
    const current = getSolarSystem(this.scene);
    const expanded = foundry.utils.expandObject(new FormDataExtended(form).object);

    if (expanded.system) {
      current.enabled = !!expanded.system.enabled;
      current.animationSpeed = numberOr(current.animationSpeed, expanded.system.animationSpeed);
      current.backgroundColor = sanitizeHex(expanded.system.backgroundColor || current.backgroundColor);
      current.showLabels = !!expanded.system.showLabels;
      current.showOrbits = !!expanded.system.showOrbits;
      current.starfieldDensity = numberOr(current.starfieldDensity, expanded.system.starfieldDensity);
    }

    if (expanded.body && this.selectedBodyId) {
      const body = current.bodies.find((b) => b.id === this.selectedBodyId);
      if (body) {
        body.name = expanded.body.name || body.name;
        body.type = expanded.body.type || body.type;
        body.color = sanitizeHex(expanded.body.color || body.color);
        body.radius = numberOr(body.radius, expanded.body.radius);
        body.glow = numberOr(body.glow, expanded.body.glow);
        body.description = expanded.body.description ?? body.description;
        body.journalUuid = expanded.body.journalUuid ?? body.journalUuid;
        body.parentId = expanded.body.parentId || null;
        body.orbitTarget = expanded.body.orbitTarget || null;
        body.orbitMode = expanded.body.orbitMode || body.orbitMode;
        body.orbitRadiusX = numberOr(body.orbitRadiusX, expanded.body.orbitRadiusX);
        body.orbitRadiusY = numberOr(body.orbitRadiusY, expanded.body.orbitRadiusY);
        body.orbitPeriod = numberOr(body.orbitPeriod, expanded.body.orbitPeriod);
        body.orbitPhase = numberOr(body.orbitPhase, expanded.body.orbitPhase);
        body.pairId = expanded.body.pairId ?? body.pairId;
        body.pairDistance = numberOr(body.pairDistance, expanded.body.pairDistance);
        body.pairPeriod = numberOr(body.pairPeriod, expanded.body.pairPeriod);
        body.pairPhase = numberOr(body.pairPhase, expanded.body.pairPhase);
        body.binaryGroup = expanded.body.binaryGroup ?? body.binaryGroup;
        body.binarySeparation = numberOr(body.binarySeparation, expanded.body.binarySeparation);
        body.binaryPeriod = numberOr(body.binaryPeriod, expanded.body.binaryPeriod);
        body.binaryPhase = numberOr(body.binaryPhase, expanded.body.binaryPhase);
        body.showLabel = !!expanded.body.showLabel;
      }
    }

    await this.scene.setFlag(MODULE_ID, FLAG_KEY, normalizeSystemData(current));
  }

  async _addBody(type) {
    const current = getSolarSystem(this.scene);
    const selected = current.bodies.find((b) => b.id === this.selectedBodyId);
    const anchorStar = current.bodies.find((b) => b.type === "star");
    const body = normalizeBodyData({
      name: newBodyName(type, current.bodies),
      type,
      color: defaultColor(type),
      radius: type === "star" ? 36 : type === "planet" ? 14 : 7,
      glow: type === "star" ? 1.2 : 1,
      parentId: type === "moon" ? (selected?.type === "planet" ? selected.id : null) : null,
      orbitTarget: type === "star" ? null : (selected?.id ?? anchorStar?.id ?? null),
      orbitMode: type === "star" ? "static" : "ellipse",
      orbitRadiusX: type === "moon" ? 40 : 220,
      orbitRadiusY: type === "moon" ? 32 : 180,
      orbitPeriod: type === "moon" ? 5 : 25,
      showLabel: true
    });
    current.bodies.push(body);
    this.selectedBodyId = body.id;
    await this.scene.setFlag(MODULE_ID, FLAG_KEY, current);
    this.render(true);
  }

  async _deleteSelectedBody() {
    if (!this.selectedBodyId) return;
    const current = getSolarSystem(this.scene);
    current.bodies = current.bodies.filter((b) => b.id !== this.selectedBodyId && b.parentId !== this.selectedBodyId && b.orbitTarget !== this.selectedBodyId);
    this.selectedBodyId = current.bodies[0]?.id ?? null;
    await this.scene.setFlag(MODULE_ID, FLAG_KEY, current);
    this.render(true);
  }

  selectBody(bodyId) {
    if (bodyId === this.selectedBodyId) return;
    this.selectedBodyId = bodyId;
    this.render(true);
  }

  refreshIfScene(scene) {
    if (scene.id !== this.scene?.id) return;
    this.render(false);
  }

  close(options) {
    SolarSystemEditor.instance = null;
    return super.close(options);
  }
}

class SolarSystemOverlay {
  constructor(scene, data) {
    this.scene = scene;
    this.data = data;
    this.root = new PIXI.Container();
    this.field = new PIXI.Graphics();
    this.orbits = new PIXI.Graphics();
    this.bodyLayer = new PIXI.Container();
    this.labelLayer = new PIXI.Container();
    this.root.addChild(this.field, this.orbits, this.bodyLayer, this.labelLayer);
    this.positionCache = new Map();
    this.viewStack = [];
    this.elapsed = 0;
    this.ticker = (ticker) => this.update(ticker.deltaTime / 60);
    this.hud = this._createHud();
  }

  attach() {
    canvas.stage.addChild(this.root);
    canvas.app.ticker.add(this.ticker);
    this.render(true);
  }

  destroy() {
    canvas.app?.ticker?.remove(this.ticker);
    this.hud?.remove();
    this.root?.destroy({ children: true });
    this.positionCache.clear();
  }

  update(delta) {
    this.elapsed += delta * (this.data.animationSpeed || 1);
    this.render(false);
  }

  render(full) {
    this.data = getSolarSystem(this.scene);
    const view = this._currentView();
    if (full) this._drawStarfield();
    this._drawOrbits(view);
    this._drawBodies(view);
    this._syncHud(view);
  }

  _currentView() {
    const focusedId = this.viewStack.at(-1) ?? null;
    const focusedBody = this.data.bodies.find((b) => b.id === focusedId) ?? null;
    return {
      type: focusedBody ? focusedBody.type : "system",
      focusedBody,
      title: focusedBody?.name ?? this.scene.name,
      bodies: focusedBody ? this.data.bodies.filter((b) => b.parentId === focusedBody.id) : this.data.bodies.filter((b) => !b.parentId)
    };
  }

  _drawStarfield() {
    const bounds = canvas.dimensions;
    this.field.clear();
    this.field.beginFill(hexToNumber(this.data.backgroundColor), 1);
    this.field.drawRect(0, 0, bounds.width, bounds.height);
    this.field.endFill();

    const count = Math.max(20, Number(this.data.starfieldDensity || 60));
    const seed = hashString(`${this.scene.id}:${count}`);
    for (let i = 0; i < count; i += 1) {
      const x = pseudoRandom(seed + i * 2) * bounds.width;
      const y = pseudoRandom(seed + i * 3) * bounds.height;
      const r = 0.5 + pseudoRandom(seed + i * 5) * 1.8;
      const a = 0.18 + pseudoRandom(seed + i * 7) * 0.75;
      this.field.beginFill(0xffffff, a);
      this.field.drawCircle(x, y, r);
      this.field.endFill();
    }
  }

  _drawOrbits(view) {
    this.orbits.clear();
    if (!this.data.showOrbits) return;
    this.orbits.lineStyle(1, 0xffffff, 0.18);

    if (!view.focusedBody) {
      const binaryGroups = groupBinaryStars(this.data.bodies);
      for (const stars of binaryGroups.values()) {
        if (stars.length < 2) continue;
        const center = this._sceneCenter();
        const separation = average(stars.map((s) => s.binarySeparation || 160));
        this.orbits.drawCircle(center.x, center.y, separation / 2);
      }
    }

    for (const body of view.bodies) {
      if (body.type === "star" && !view.focusedBody) continue;
      const anchor = view.focusedBody ? this._sceneCenter() : this._resolveAnchor(body);
      if (!anchor) continue;
      if (body.orbitMode === "figure8") {
        this._drawFigure8(anchor, Math.max(30, Number(body.orbitRadiusX || 60)), Math.max(20, Number(body.orbitRadiusY || 40)));
      } else if (body.orbitMode === "ellipse") {
        this.orbits.drawEllipse(anchor.x, anchor.y, Math.max(10, Number(body.orbitRadiusX || 10)), Math.max(10, Number(body.orbitRadiusY || 10)));
      }
    }
  }

  _drawFigure8(center, scaleX, scaleY) {
    const steps = 72;
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * Math.PI * 2;
      const denom = 1 + Math.sin(t) ** 2;
      const x = center.x + (scaleX * Math.cos(t)) / denom;
      const y = center.y + (scaleY * Math.sin(t) * Math.cos(t)) / denom;
      if (i === 0) this.orbits.moveTo(x, y);
      else this.orbits.lineTo(x, y);
    }
  }

  _drawBodies(view) {
    this.positionCache.clear();
    this.bodyLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.labelLayer.removeChildren().forEach((c) => c.destroy({ children: true }));

    if (view.focusedBody) {
      const center = this._sceneCenter();
      this.positionCache.set(view.focusedBody.id, { x: center.x, y: center.y, angle: 0, anchorAngle: 0 });
      this._drawOneBody(view.focusedBody, center, { focused: true, scaleMultiplier: 4.2 });
    }

    for (const body of view.bodies) {
      const pos = view.focusedBody ? this._resolveChildInFocusedView(body) : this._resolveBodyPosition(body);
      this.positionCache.set(body.id, pos);
      this._drawOneBody(body, pos, { focused: false, scaleMultiplier: view.focusedBody ? 2.2 : 1 });
    }
  }

  _drawOneBody(body, position, { focused = false, scaleMultiplier = 1 } = {}) {
    const radius = Math.max(3, Number(body.radius || 10) * scaleMultiplier);
    const tint = hexToNumber(body.color);
    const pulse = 1 + (Math.sin(this.elapsed * 1.7 + hashString(body.id)) * 0.05);

    const container = new PIXI.Container();
    container.x = position.x;
    container.y = position.y;
    container.eventMode = "static";
    container.cursor = "pointer";
    container.hitArea = new PIXI.Circle(0, 0, Math.max(radius * 1.5, 18));
    container.on("pointertap", (event) => this._handleBodyClick(event, body.id));

    const halo = new PIXI.Graphics();
    const graphic = new PIXI.Graphics();

    if (body.type === "star") {
      halo.beginFill(tint, 0.08 * (body.glow || 1));
      halo.drawCircle(0, 0, radius * 2.0 * pulse);
      halo.endFill();
      halo.beginFill(tint, 0.16 * (body.glow || 1));
      halo.drawCircle(0, 0, radius * 1.55 * pulse);
      halo.endFill();
    } else {
      halo.beginFill(tint, focused ? 0.16 : 0.1);
      halo.drawCircle(0, 0, radius * 1.2 * pulse);
      halo.endFill();
    }

    const selectedByEditor = SolarSystemEditor.instance?.selectedBodyId === body.id;
    graphic.lineStyle(selectedByEditor ? 3 : 1.5, selectedByEditor ? 0xffffff : 0x000000, selectedByEditor ? 0.9 : 0.55);
    graphic.beginFill(tint, 1);
    graphic.drawCircle(0, 0, radius);
    graphic.endFill();
    graphic.lineStyle(1, 0xffffff, body.type === "star" ? 0.22 : 0.16);
    graphic.moveTo(-radius * 0.45, -radius * 0.2);
    graphic.lineTo(radius * 0.18, radius * 0.28);

    container.addChild(halo, graphic);
    this.bodyLayer.addChild(container);

    if (this.data.showLabels && body.showLabel !== false) {
      const label = new PIXI.Text(body.name, {
          fill: 0xffffff,
          fontSize: focused ? 18 : 14,
          fontFamily: "Signika, sans-serif",
          stroke: 0x000000,
          strokeThickness: 4,
          align: "center"
      });
      label.anchor.set(0.5, 0);
      label.x = position.x;
      label.y = position.y + radius + 8;
      this.labelLayer.addChild(label);
    }
  }

  _resolveBodyPosition(body) {
    if (body.type === "star") return this._resolveStarPosition(body);
    const anchor = this._resolveAnchor(body) ?? this._sceneCenter();
    const angle = this.elapsed / Math.max(0.001, Number(body.orbitPeriod || 10)) + Number(body.orbitPhase || 0);
    let x = anchor.x;
    let y = anchor.y;

    if (body.orbitMode === "figure8") {
      const denom = 1 + Math.sin(angle) ** 2;
      x += (Number(body.orbitRadiusX || 0) * Math.cos(angle)) / denom;
      y += (Number(body.orbitRadiusY || 0) * Math.sin(angle) * Math.cos(angle)) / denom;
    } else if (body.orbitMode === "ellipse") {
      x += Number(body.orbitRadiusX || 0) * Math.cos(angle);
      y += Number(body.orbitRadiusY || 0) * Math.sin(angle);
    }

    return this._applyPairOffset(body, { x, y }, angle);
  }

  _resolveChildInFocusedView(body) {
    const center = this._sceneCenter();
    const angle = this.elapsed / Math.max(0.001, Number(body.orbitPeriod || 10)) + Number(body.orbitPhase || 0);
    let x = center.x;
    let y = center.y;
    if (body.orbitMode === "figure8") {
      const denom = 1 + Math.sin(angle) ** 2;
      x += (Number(body.orbitRadiusX || 0) * 2.2 * Math.cos(angle)) / denom;
      y += (Number(body.orbitRadiusY || 0) * 2.2 * Math.sin(angle) * Math.cos(angle)) / denom;
    } else if (body.orbitMode === "ellipse") {
      x += Number(body.orbitRadiusX || 0) * 2.2 * Math.cos(angle);
      y += Number(body.orbitRadiusY || 0) * 2.2 * Math.sin(angle);
    }
    return this._applyPairOffset(body, { x, y }, angle);
  }

  _resolveStarPosition(body) {
    const center = this._sceneCenter();
    if (!body.binaryGroup) return { x: center.x, y: center.y, angle: 0, anchorAngle: 0 };
    const group = this.data.bodies.filter((b) => b.type === "star" && b.binaryGroup === body.binaryGroup);
    if (group.length < 2) return { x: center.x, y: center.y, angle: 0, anchorAngle: 0 };
    const angle = this.elapsed / Math.max(0.001, Number(body.binaryPeriod || 10)) + Number(body.binaryPhase || 0);
    const separation = Number(body.binarySeparation || 160);
    return {
      x: center.x + (separation / 2) * Math.cos(angle),
      y: center.y + (separation / 2) * Math.sin(angle),
      angle,
      anchorAngle: angle
    };
  }

  _resolveAnchor(body) {
    if (!body.orbitTarget) return this._sceneCenter();
    if (String(body.orbitTarget).startsWith("binary:")) {
      const group = String(body.orbitTarget).split(":")[1];
      const stars = this.data.bodies.filter((b) => b.type === "star" && b.binaryGroup === group);
      if (!stars.length) return this._sceneCenter();
      const positions = stars.map((star) => this._resolveStarPosition(star));
      return { x: average(positions.map((p) => p.x)), y: average(positions.map((p) => p.y)) };
    }
    const target = this.data.bodies.find((b) => b.id === body.orbitTarget);
    if (!target) return this._sceneCenter();
    const cached = this.positionCache.get(target.id);
    if (cached) return cached;
    return target.type === "star" ? this._resolveStarPosition(target) : this._resolveBodyPosition(target);
  }

  _applyPairOffset(body, point, angle) {
    if (!body.pairId) return { x: point.x, y: point.y, angle, anchorAngle: angle };
    const pairBodies = this.data.bodies.filter((b) => b.pairId && b.pairId === body.pairId).sort((a, b) => a.id.localeCompare(b.id));
    const index = Math.max(0, pairBodies.findIndex((b) => b.id === body.id));
    const pairAngle = this.elapsed / Math.max(0.001, Number(body.pairPeriod || 5)) + Number(body.pairPhase || 0) + index * Math.PI;
    return {
      x: point.x + (Number(body.pairDistance || 0) / 2) * Math.cos(pairAngle),
      y: point.y + (Number(body.pairDistance || 0) / 2) * Math.sin(pairAngle),
      angle,
      anchorAngle: pairAngle
    };
  }

  _sceneCenter() {
    return { x: canvas.dimensions.width / 2, y: canvas.dimensions.height / 2 };
  }

  _handleBodyClick(event, bodyId) {
    event.stopPropagation();
    const body = this.data.bodies.find((candidate) => candidate.id === bodyId);
    if (!body) return;

    if (game.user.isGM && SolarSystemEditor.instance?.rendered) {
      SolarSystemEditor.instance.selectBody(bodyId);
      return;
    }

    const current = this._currentView();
    if (!current.focusedBody && body.type !== "star") {
      this.viewStack.push(body.id);
      this.render(true);
      return;
    }

    const children = this.data.bodies.filter((b) => b.parentId === body.id);
    if (children.length) {
      this.viewStack.push(body.id);
      this.render(true);
      return;
    }

    this._showInfo(body);
  }

  _showInfo(body) {
    const content = [`<div class="${MODULE_ID}-info">`];
    content.push(`<p><strong>Type:</strong> ${body.type}</p>`);
    if (body.description) content.push(`<p>${escapeHtml(body.description)}</p>`);
    if (body.journalUuid) content.push(`<p><strong>Journal UUID:</strong> <code>${body.journalUuid}</code></p>`);
    content.push("</div>");
    new Dialog({ title: body.name, content: content.join(""), buttons: { ok: { label: "Close" } } }).render(true);
  }

  _createHud() {
    const hud = document.createElement("div");
    hud.className = `${MODULE_ID}-hud`;
    hud.innerHTML = `
      <div class="${MODULE_ID}-hud__trail"></div>
      <div class="${MODULE_ID}-hud__actions">
        <button type="button" data-action="back">Back</button>
        <button type="button" data-action="info">Info</button>
      </div>
    `;
    document.body.appendChild(hud);
    hud.querySelector("[data-action='back']")?.addEventListener("click", () => {
      if (!this.viewStack.length) return;
      this.viewStack.pop();
      this.render(true);
    });
    hud.querySelector("[data-action='info']")?.addEventListener("click", () => {
      const focusedId = this.viewStack.at(-1);
      const focused = this.data.bodies.find((b) => b.id === focusedId);
      if (focused) this._showInfo(focused);
    });
    return hud;
  }

  _syncHud(view) {
    if (!this.hud) return;
    const trail = this.hud.querySelector(`.${MODULE_ID}-hud__trail`);
    const backButton = this.hud.querySelector("[data-action='back']");
    const infoButton = this.hud.querySelector("[data-action='info']");
    const trailParts = [this.scene.name, ...this.viewStack.map((id) => this.data.bodies.find((b) => b.id === id)?.name).filter(Boolean)];
    trail.textContent = trailParts.join(" / ");
    backButton.disabled = !this.viewStack.length;
    const hasInfo = !!view.focusedBody && (!!view.focusedBody.description || !!view.focusedBody.journalUuid);
    infoButton.disabled = !hasInfo;
    this.hud.style.display = this.data.enabled ? "flex" : "none";
  }
}

function groupBinaryStars(bodies) {
  const groups = new Map();
  for (const body of bodies.filter((b) => b.type === "star" && b.binaryGroup)) {
    if (!groups.has(body.binaryGroup)) groups.set(body.binaryGroup, []);
    groups.get(body.binaryGroup).push(body);
  }
  return groups;
}

function iconForType(type) {
  if (type === "star") return "☀";
  if (type === "moon") return "◐";
  return "●";
}

function capitalize(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function defaultColor(type) {
  if (type === "star") return "#ffcc66";
  if (type === "moon") return "#d4d8df";
  return "#8ecae6";
}

function newBodyName(type, bodies) {
  const base = capitalize(type);
  let i = 1;
  while (bodies.some((body) => body.name === `${base} ${i}`)) i += 1;
  return `${base} ${i}`;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function numberOr(fallback, value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hashString(string) {
  let hash = 0;
  for (let i = 0; i < string.length; i += 1) {
    hash = ((hash << 5) - hash) + string.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453123;
  return x - Math.floor(x);
}

function sanitizeHex(value) {
  const normalized = String(value || "#ffffff").replace(/[^0-9a-f]/gi, "").slice(0, 6);
  return `#${(normalized || "ffffff").padEnd(6, "0")}`;
}

function hexToNumber(hex) {
  return Number.parseInt(sanitizeHex(hex).slice(1), 16);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML.replace(/\n/g, "<br>");
}
