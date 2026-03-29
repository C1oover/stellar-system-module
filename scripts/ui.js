import { BODY_TYPES, ORBIT_MODES, MODULE_ID, deepClone, hexToString, num } from "./config.js";
import { createAutopopulatedSystem } from "./defaults.js";
import { addBody, buildMaps, canFocusInto, createBody, deleteBody, getBodyById, getChildren, normalizeSystem, patchBody, updateMetadata } from "./model.js";

function escapeHtml(str = "") {
  return foundry.utils.escapeHTML(String(str));
}

function debounce(fn, delay = 250) {
  let id;
  return (...args) => {
    window.clearTimeout(id);
    id = window.setTimeout(() => fn(...args), delay);
  };
}

function setByPath(target, path, value) {
  const parts = path.split(".");
  let ref = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    ref[parts[i]] ??= {};
    ref = ref[parts[i]];
  }
  ref[parts[parts.length - 1]] = value;
}

function orbitModeLabel(mode) {
  switch (mode) {
    case ORBIT_MODES.ROOT: return "Root";
    case ORBIT_MODES.STATIC: return "Static";
    case ORBIT_MODES.KEPLER: return "Kepler";
    case ORBIT_MODES.BINARY: return "Binary Pair";
    case ORBIT_MODES.FIGURE8: return "Figure 8";
    default: return mode;
  }
}

function bodyTypeLabel(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export class SolarSystemUI {
  constructor(controller) {
    this.controller = controller;
    this.root = null;
    this.gmPanel = null;
    this.playerHud = null;
    this._debouncedSave = debounce(() => this.controller.persistSystem(), 200);
  }

  mount() {
    if (this.root) return;
    this.root = document.createElement("div");
    this.root.id = `${MODULE_ID}-ui-root`;
    this.root.innerHTML = `
      <aside class="gss-gm-panel hidden"></aside>
      <aside class="gss-player-hud"></aside>
    `;
    document.body.appendChild(this.root);
    this.gmPanel = this.root.querySelector(".gss-gm-panel");
    this.playerHud = this.root.querySelector(".gss-player-hud");
    this._activateGlobalListeners();
    this.render();
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.gmPanel = null;
    this.playerHud = null;
  }

  _activateGlobalListeners() {
    this.root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      event.preventDefault();
      this._handleAction(action, event);
    });

    this.root.addEventListener("input", (event) => {
      const input = event.target.closest("[data-path]");
      if (!input) return;
      const system = this.controller.getSystem();
      const selected = getBodyById(system, this.controller.local.selectedId);
      if (!selected) return;
      const patch = {};
      let value = input.type === "checkbox" ? input.checked : input.value;
      if (input.type === "number" || input.dataset.type === "number") value = num(value, 0);
      if (input.type === "color") value = value;
      setByPath(patch, input.dataset.path, value);
      this.controller.setSystem(patchBody(system, selected.id, patch), { persist: false });
      this._debouncedSave();
      this.render();
    });

    this.root.addEventListener("change", (event) => {
      const input = event.target.closest("[data-meta-path]");
      if (!input) return;
      const patch = {};
      let value = input.type === "checkbox" ? input.checked : input.value;
      if (input.type === "number" || input.dataset.type === "number") value = num(value, 0);
      setByPath(patch, input.dataset.metaPath, value);
      this.controller.setSystem(updateMetadata(this.controller.getSystem(), patch), { persist: false });
      this._debouncedSave();
      this.render();
    });
  }

  render() {
    const system = normalizeSystem(this.controller.getSystem() ?? { metadata: {}, bodies: [] });
    const { map } = buildMaps(system);
    const selected = getBodyById(system, this.controller.local.selectedId);

    if (this.gmPanel) {
      this.gmPanel.classList.toggle("hidden", !game.user.isGM || !this.controller.local.gmHudOpen);
      if (game.user.isGM) this.gmPanel.innerHTML = this._renderGmPanel(system, selected, map);
    }

    if (this.playerHud) this.playerHud.innerHTML = this._renderPlayerHud(system, map);
  }

  _renderGmPanel(system, selected, map) {
    const focusName = this.controller.local.focusId ? map.get(this.controller.local.focusId)?.name ?? "Focused" : "Full System";
    return `
      <div class="gss-panel-header">
        <div>
          <h2>Solar System</h2>
          <p>${escapeHtml(system.metadata.name || canvas.scene?.name || "Untitled System")}</p>
        </div>
        <button data-action="toggle-gm-panel" class="gss-icon-button" title="Close"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <section class="gss-panel-section">
        <div class="gss-toolbar">
          <button data-action="create-system">Create</button>
          <button data-action="randomize-system">Autopopulate</button>
          <button data-action="persist">Save</button>
        </div>
        <div class="gss-toolbar">
          <button data-action="focus-back" ${this.controller.local.stack.length ? "" : "disabled"}>Back</button>
          <button data-action="focus-reset">Reset View</button>
          <span class="gss-chip">${escapeHtml(focusName)}</span>
        </div>
      </section>

      <section class="gss-panel-section gss-grid-two">
        <label>
          <span>System Name</span>
          <input type="text" data-meta-path="name" value="${escapeHtml(system.metadata.name || "")}">
        </label>
        <label>
          <span>Time Scale</span>
          <input type="number" data-meta-path="timeScale" data-type="number" value="${Number(system.metadata.timeScale) || 2400}" step="10">
        </label>
        <label>
          <span>Gravity G</span>
          <input type="number" data-meta-path="gravitationalConstant" data-type="number" value="${Number(system.metadata.gravitationalConstant) || 0.0045}" step="0.0001">
        </label>
        <label>
          <span>Background</span>
          <input type="color" data-meta-path="background.color" value="${hexToString(system.metadata.background?.color ?? 0x050816)}">
        </label>
      </section>

      <section class="gss-panel-section">
        <div class="gss-panel-subheader">
          <h3>Bodies</h3>
          <div class="gss-toolbar small">
            <button data-action="add-star">+ Star</button>
            <button data-action="add-planet">+ Planet</button>
            <button data-action="add-twin-pair">+ Twin Pair</button>
            <button data-action="add-moon" ${selected && [BODY_TYPES.PLANET, BODY_TYPES.MOON].includes(selected.type) ? "" : "disabled"}>+ Moon</button>
          </div>
        </div>
        <div class="gss-tree">${this._renderTree(system, "root-system")}</div>
      </section>

      <section class="gss-panel-section">
        <div class="gss-panel-subheader">
          <h3>${selected ? escapeHtml(selected.name) : "Selection"}</h3>
          ${selected ? `<div class="gss-toolbar small"><button data-action="focus-selected">Focus</button><button data-action="inspect-selected">Info</button><button data-action="delete-selected">Delete</button></div>` : ""}
        </div>
        ${selected ? this._renderBodyEditor(system, selected) : `<p class="gss-muted">Click a sun, planet, moon, or tree entry to edit it.</p>`}
      </section>
    `;
  }

  _renderTree(system, parentId) {
    const children = getChildren(system, parentId)
      .sort((a, b) => {
        const order = { star: 0, barycenter: 1, planet: 2, moon: 3 };
        return (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.name.localeCompare(b.name);
      });

    if (!children.length) return parentId === "root-system" ? `<p class="gss-muted">No bodies yet.</p>` : "";
    return `<ul>${children.map((body) => `
      <li>
        <button data-action="select-body" data-body-id="${body.id}" class="gss-tree-item ${this.controller.local.selectedId === body.id ? "active" : ""}">
          <span>${escapeHtml(body.name)}</span>
          <small>${escapeHtml(bodyTypeLabel(body.type))}</small>
        </button>
        ${this._renderTree(system, body.id)}
      </li>
    `).join("")}</ul>`;
  }

  _renderBodyEditor(system, body) {
    const stars = system.bodies.filter((b) => b.type === BODY_TYPES.STAR);
    const anchors = system.bodies.filter((b) => [BODY_TYPES.STAR, BODY_TYPES.BARYCENTER, BODY_TYPES.ROOT, BODY_TYPES.PLANET, BODY_TYPES.MOON].includes(b.type));
    const orbitSection = body.type === BODY_TYPES.ROOT ? "" : `
      <div class="gss-editor-grid">
        <label>
          <span>Orbit Mode</span>
          <select data-path="orbit.mode">
            ${Object.values(ORBIT_MODES).map((mode) => `<option value="${mode}" ${body.orbit.mode === mode ? "selected" : ""}>${escapeHtml(orbitModeLabel(mode))}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Parent</span>
          <select data-path="parentId">
            ${anchors.filter((a) => a.id !== body.id).map((anchor) => `<option value="${anchor.id}" ${body.parentId === anchor.id ? "selected" : ""}>${escapeHtml(anchor.name)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Primary</span>
          <select data-path="orbit.primaryId">
            <option value="">—</option>
            ${anchors.filter((a) => a.id !== body.id).map((anchor) => `<option value="${anchor.id}" ${body.orbit.primaryId === anchor.id ? "selected" : ""}>${escapeHtml(anchor.name)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Secondary</span>
          <select data-path="orbit.secondaryId">
            <option value="">—</option>
            ${stars.filter((a) => a.id !== body.id).map((anchor) => `<option value="${anchor.id}" ${body.orbit.secondaryId === anchor.id ? "selected" : ""}>${escapeHtml(anchor.name)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Semi-Major Axis</span>
          <input type="number" data-path="orbit.semiMajorAxis" data-type="number" value="${Number(body.orbit.semiMajorAxis) || 0}" step="1">
        </label>
        <label>
          <span>Eccentricity</span>
          <input type="number" data-path="orbit.eccentricity" data-type="number" value="${Number(body.orbit.eccentricity) || 0}" step="0.01" min="0" max="0.8">
        </label>
        <label>
          <span>Phase</span>
          <input type="number" data-path="orbit.phase" data-type="number" value="${Number(body.orbit.phase) || 0}" step="0.1">
        </label>
        <label>
          <span>Inclination</span>
          <input type="number" data-path="orbit.inclination" data-type="number" value="${Number(body.orbit.inclination) || 0}" step="0.01">
        </label>
        <label>
          <span>Figure 8 Scale</span>
          <input type="number" data-path="orbit.figure8Scale" data-type="number" value="${Number(body.orbit.figure8Scale) || 0}" step="1">
        </label>
        <label>
          <span>Binary Separation</span>
          <input type="number" data-path="orbit.binarySeparation" data-type="number" value="${Number(body.orbit.binarySeparation) || 0}" step="1">
        </label>
        <label class="checkbox-row">
          <input type="checkbox" data-path="orbit.clockwise" ${body.orbit.clockwise ? "checked" : ""}>
          <span>Clockwise</span>
        </label>
      </div>
    `;

    return `
      <div class="gss-editor-grid">
        <label>
          <span>Name</span>
          <input type="text" data-path="name" value="${escapeHtml(body.name)}">
        </label>
        <label>
          <span>Type</span>
          <input type="text" value="${escapeHtml(bodyTypeLabel(body.type))}" disabled>
        </label>
        <label>
          <span>Mass</span>
          <input type="number" data-path="mass" data-type="number" value="${Number(body.mass) || 0}" step="1">
        </label>
        <label>
          <span>Radius</span>
          <input type="number" data-path="radius" data-type="number" value="${Number(body.radius) || 0}" step="1">
        </label>
        <label>
          <span>Color</span>
          <input type="color" data-path="color" value="${hexToString(body.color)}">
        </label>
        ${body.type === BODY_TYPES.STAR ? `
          <label>
            <span>Glow</span>
            <input type="number" data-path="glow" data-type="number" value="${Number(body.glow) || 0}" step="0.05">
          </label>
        ` : ""}
      </div>
      ${orbitSection}
      <div class="gss-editor-grid single">
        <label>
          <span>Summary</span>
          <input type="text" data-path="info.summary" value="${escapeHtml(body.info?.summary || "")}">
        </label>
        <label>
          <span>Details</span>
          <textarea data-path="info.details" rows="4">${escapeHtml(body.info?.details || "")}</textarea>
        </label>
      </div>
    `;
  }

  _renderPlayerHud(system, map) {
    const focusName = this.controller.local.focusId ? map.get(this.controller.local.focusId)?.name ?? "Focused" : "System View";
    const crumbs = ["System", ...this.controller.local.stack.map((id) => map.get(id)?.name).filter(Boolean), ...(this.controller.local.focusId ? [focusName] : [])];
    return `
      <div class="gss-player-card">
        <div class="gss-panel-subheader">
          <div>
            <h3>${escapeHtml(focusName)}</h3>
            <p>${escapeHtml(system.metadata.name || canvas.scene?.name || "")}</p>
          </div>
          <div class="gss-toolbar small">
            <button data-action="focus-back" ${this.controller.local.stack.length ? "" : "disabled"}>Back</button>
            <button data-action="focus-reset" ${this.controller.local.focusId ? "" : "disabled"}>Full View</button>
            ${game.user.isGM ? `<button data-action="toggle-gm-panel">Editor</button>` : ""}
          </div>
        </div>
        <div class="gss-breadcrumbs">${crumbs.map((c) => `<span>${escapeHtml(c)}</span>`).join("<i class='fa-solid fa-angle-right'></i>")}</div>
        <p class="gss-muted small">Players can click visible planets or moons in the current view for info and deeper zoom.</p>
      </div>
    `;
  }

  _handleAction(action, event) {
    const system = this.controller.getSystem();
    switch (action) {
      case "toggle-gm-panel":
        this.controller.local.gmHudOpen = !this.controller.local.gmHudOpen;
        this.render();
        break;
      case "create-system":
      case "randomize-system":
        this.openCreateDialog();
        break;
      case "persist":
        this.controller.persistSystem();
        break;
      case "focus-back":
        this.controller.focusBack();
        this.render();
        break;
      case "focus-reset":
        this.controller.resetFocus();
        this.render();
        break;
      case "focus-selected":
        if (this.controller.local.selectedId) this.controller.focusInto(this.controller.local.selectedId);
        this.render();
        break;
      case "inspect-selected": {
        const body = getBodyById(system, this.controller.local.selectedId);
        if (body) this.inspectBody(body);
        break;
      }
      case "delete-selected":
        if (this.controller.local.selectedId) {
          this.controller.setSystem(deleteBody(system, this.controller.local.selectedId), { persist: true });
          this.controller.local.selectedId = null;
          this.render();
        }
        break;
      case "select-body": {
        const bodyId = event.target.closest("[data-body-id]")?.dataset.bodyId;
        if (!bodyId) return;
        this.controller.local.selectedId = bodyId;
        this.render();
        break;
      }
      case "add-star":
        this._addStar();
        break;
      case "add-planet":
        this._addPlanet();
        break;
      case "add-moon":
        this._addMoon();
        break;
      case "add-twin-pair":
        this._addTwinPair();
        break;
      default:
        break;
    }
  }

  async openCreateDialog() {
    const content = `
      <form class="gss-create-form">
        <div class="form-group"><label>Name</label><input type="text" name="name" value="Generated Star System"></div>
        <div class="form-group"><label>Seed</label><input type="text" name="seed" value="${Date.now()}"></div>
        <div class="form-group"><label>Star Mode</label>
          <select name="starMode"><option value="single">Single</option><option value="binary">Binary</option></select>
        </div>
        <div class="form-group"><label>Planets</label><input type="number" name="planetCount" value="6" min="1" max="16"></div>
        <div class="form-group"><label>Max Moons</label><input type="number" name="maxMoons" value="3" min="0" max="8"></div>
        <div class="form-group"><label>Time Scale</label><input type="number" name="timeScale" value="2400" min="1"></div>
      </form>
    `;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Create Solar System" },
      content,
      ok: {
        label: "Create",
        callback: (event, button) => {
          const fd = new FormDataExtended(button.form).object;
          return {
            name: fd.name,
            seed: fd.seed,
            starMode: fd.starMode,
            planetCount: Number(fd.planetCount || 6),
            maxMoons: Number(fd.maxMoons || 3),
            timeScale: Number(fd.timeScale || 2400)
          };
        }
      }
    }).catch(() => null);

    if (!result) return;
    const system = createAutopopulatedSystem(result);
    this.controller.setSystem(system, { persist: true });
    this.controller.resetFocus();
    this.controller.local.selectedId = system.bodies.find((b) => b.type === BODY_TYPES.STAR)?.id ?? null;
    this.render();
  }

  inspectBody(body) {
    const html = `
      <div class="gss-info-card">
        <h2>${escapeHtml(body.name)}</h2>
        <p><strong>${escapeHtml(bodyTypeLabel(body.type))}</strong></p>
        <p>${escapeHtml(body.info?.summary || "No summary provided.")}</p>
        <p>${escapeHtml(body.info?.details || "No detailed information provided.")}</p>
      </div>
    `;
    new foundry.applications.api.DialogV2({
      window: { title: body.name },
      content: html,
      buttons: [{ action: "ok", label: "Close", default: true }]
    }).render({ force: true });
  }

  handleBodyClick(body) {
    if (game.user.isGM) {
      this.controller.local.selectedId = body.id;
      this.controller.local.gmHudOpen = true;
      this.render();
      return;
    }

    const currentFocus = this.controller.local.focusId;
    const visibleTarget = !currentFocus || body.parentId === currentFocus || body.id === currentFocus;
    if (!visibleTarget) return;

    this.inspectBody(body);
    if (canFocusInto(body) && getChildren(this.controller.getSystem(), body.id).length) {
      this.controller.focusInto(body.id);
      this.render();
    }
  }

  _addStar() {
    const system = normalizeSystem(this.controller.getSystem());
    const star = createBody({ type: BODY_TYPES.STAR, parentId: "root-system", name: `Star ${system.bodies.filter((b) => b.type === BODY_TYPES.STAR).length + 1}`, color: "#ffd76a" });
    const stars = system.bodies.filter((b) => b.type === BODY_TYPES.STAR && b.parentId === "root-system");
    if (stars.length === 1) {
      const existing = deepClone(stars[0]);
      existing.orbit.mode = ORBIT_MODES.BINARY;
      existing.orbit.partnerId = star.id;
      existing.orbit.binarySeparation = existing.orbit.binarySeparation || 220;
      existing.orbit.phase = 0;
      star.orbit.mode = ORBIT_MODES.BINARY;
      star.orbit.partnerId = existing.id;
      star.orbit.binarySeparation = existing.orbit.binarySeparation;
      star.orbit.phase = Math.PI;
      let next = patchBody(system, existing.id, existing);
      next = addBody(next, star);
      this.controller.setSystem(next, { persist: true });
    } else {
      this.controller.setSystem(addBody(system, star), { persist: true });
    }
    this.controller.local.selectedId = star.id;
    this.render();
  }

  _resolvePlanetAnchor(system) {
    const selected = getBodyById(system, this.controller.local.selectedId);
    if (selected?.type === BODY_TYPES.STAR) return { parentId: selected.id, primaryId: selected.id, secondaryId: null };
    if (selected?.type === BODY_TYPES.BARYCENTER) return { parentId: selected.id, primaryId: selected.id, secondaryId: null };

    const rootStars = system.bodies.filter((b) => b.type === BODY_TYPES.STAR && b.parentId === "root-system");
    if (rootStars.length >= 2) return { parentId: "root-system", primaryId: rootStars[0].id, secondaryId: rootStars[1].id };
    if (rootStars.length === 1) return { parentId: rootStars[0].id, primaryId: rootStars[0].id, secondaryId: null };
    return { parentId: "root-system", primaryId: null, secondaryId: null };
  }

  _addPlanet() {
    const system = normalizeSystem(this.controller.getSystem());
    const anchor = this._resolvePlanetAnchor(system);
    const planet = createBody({ type: BODY_TYPES.PLANET, parentId: anchor.parentId, name: `Planet ${system.bodies.filter((b) => b.type === BODY_TYPES.PLANET).length + 1}`, color: "#70c98d" });
    planet.orbit.primaryId = anchor.primaryId;
    planet.orbit.secondaryId = anchor.secondaryId;
    if (anchor.secondaryId) planet.orbit.mode = ORBIT_MODES.KEPLER;
    const next = addBody(system, planet);
    this.controller.setSystem(next, { persist: true });
    this.controller.local.selectedId = planet.id;
    this.render();
  }

  _addMoon() {
    const system = normalizeSystem(this.controller.getSystem());
    const selected = getBodyById(system, this.controller.local.selectedId);
    if (!selected || ![BODY_TYPES.PLANET, BODY_TYPES.MOON].includes(selected.type)) return;
    const moon = createBody({ type: BODY_TYPES.MOON, parentId: selected.id, name: `${selected.name} Moon ${getChildren(system, selected.id).length + 1}`, color: "#cfd6df" });
    moon.orbit.primaryId = selected.id;
    moon.orbit.semiMajorAxis = Math.max((Number(selected.radius) || 14) * 4, 60);
    const next = addBody(system, moon);
    this.controller.setSystem(next, { persist: true });
    this.controller.local.selectedId = moon.id;
    this.render();
  }

  _addTwinPair() {
    const system = normalizeSystem(this.controller.getSystem());
    const anchor = this._resolvePlanetAnchor(system);
    const bary = createBody({ type: BODY_TYPES.BARYCENTER, parentId: anchor.parentId, name: `Twin Pair ${Date.now().toString().slice(-4)}` });
    bary.visible = false;
    bary.mass = 1;
    bary.radius = 1;
    bary.orbit.primaryId = anchor.primaryId;
    bary.orbit.secondaryId = anchor.secondaryId;
    bary.orbit.mode = anchor.secondaryId ? ORBIT_MODES.FIGURE8 : ORBIT_MODES.KEPLER;
    bary.orbit.figure8Scale = 180;

    const p1 = createBody({ type: BODY_TYPES.PLANET, parentId: bary.id, name: "Twin A", color: "#58a8ff" });
    const p2 = createBody({ type: BODY_TYPES.PLANET, parentId: bary.id, name: "Twin B", color: "#d7a867" });
    p1.orbit.mode = ORBIT_MODES.BINARY;
    p2.orbit.mode = ORBIT_MODES.BINARY;
    p1.orbit.partnerId = p2.id;
    p2.orbit.partnerId = p1.id;
    p1.orbit.binarySeparation = 72;
    p2.orbit.binarySeparation = 72;
    p2.orbit.phase = Math.PI;

    let next = addBody(system, bary);
    next = addBody(next, p1);
    next = addBody(next, p2);
    this.controller.setSystem(next, { persist: true });
    this.controller.local.selectedId = p1.id;
    this.render();
  }
}
