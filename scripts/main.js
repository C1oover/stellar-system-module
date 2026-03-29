import { FLAG_KEY, FLAG_SCOPE, MODULE_ID, getFlag, setFlag } from "./config.js";
import { normalizeSystem } from "./model.js";
import { SolarSystemRenderer } from "./renderer.js";
import { SolarSystemUI } from "./ui.js";

class GenericSolarSystemController {
  constructor() {
    this.system = normalizeSystem({ metadata: { name: canvas?.scene?.name || "Solar System" }, bodies: [] });
    this.local = {
      focusId: null,
      stack: [],
      selectedId: null,
      gmHudOpen: false,
      hoveredId: null
    };
    this.renderer = new SolarSystemRenderer({
      getSystem: () => this.system,
      getLocalState: () => this.local,
      onBodyClick: (body) => this.ui?.handleBodyClick(body)
    });
    this.ui = new SolarSystemUI(this);
  }

  activateScene() {
    this.system = normalizeSystem(getFlag() ?? { metadata: { name: canvas.scene?.name || "Solar System" }, bodies: [] });
    this.local.focusId = null;
    this.local.stack = [];
    this.local.selectedId = null;
    this.renderer.mount();
    this.ui.mount();
    this.renderer.refresh(true);
    this.ui.render();
  }

  deactivateScene() {
    this.renderer.destroy();
    this.ui.destroy();
  }

  getSystem() {
    return this.system;
  }

  setSystem(system, { persist = false } = {}) {
    this.system = normalizeSystem(system);
    this.renderer.refresh(true);
    this.ui.render();
    if (persist) this.persistSystem();
  }

  async persistSystem() {
    await setFlag(this.system);
  }

  focusInto(bodyId) {
    if (!bodyId || this.local.focusId === bodyId) return;
    if (this.local.focusId) this.local.stack.push(this.local.focusId);
    this.local.focusId = bodyId;
    this.renderer.refresh(false);
    this.ui.render();
  }

  focusBack() {
    this.local.focusId = this.local.stack.pop() ?? null;
    this.renderer.refresh(false);
    this.ui.render();
  }

  resetFocus() {
    this.local.focusId = null;
    this.local.stack = [];
    this.renderer.refresh(false);
    this.ui.render();
  }

  toggleGmHud(force) {
    this.local.gmHudOpen = typeof force === "boolean" ? force : !this.local.gmHudOpen;
    this.ui.render();
  }

  handleSceneFlagUpdate(scene, changed) {
    if (scene.id !== canvas.scene?.id) return;
    if (!foundry.utils.hasProperty(changed, `flags.${FLAG_SCOPE}.${FLAG_KEY}`)) return;
    this.system = normalizeSystem(getFlag(scene) ?? { metadata: { name: scene.name }, bodies: [] });
    this.renderer.refresh(true);
    this.ui.render();
  }
}

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initializing`);
});

Hooks.once("ready", () => {
  const controller = new GenericSolarSystemController();
  game.modules.get(MODULE_ID).api = controller;

  Hooks.on("canvasReady", () => controller.activateScene());
  Hooks.on("canvasTearDown", () => controller.deactivateScene());
  Hooks.on("updateScene", (scene, changed) => controller.handleSceneFlagUpdate(scene, changed));

  Hooks.on("getSceneControlButtons", (controls) => {
    controls.tokens.tools[MODULE_ID] = {
      name: MODULE_ID,
      title: "Solar System Editor",
      icon: "fa-solid fa-globe",
      order: Object.keys(controls.tokens.tools).length,
      button: true,
      visible: game.user.isGM,
      onChange: () => controller.toggleGmHud()
    };
  });
});
