const MODULE_ID = "dbz-fuzion-gm-tools";
const SYSTEM_ID = "dbz-fuzion-calibrated";
const NPC_SOURCE = `modules/${MODULE_ID}/data/npc/dbzf_npc_compendium_source.json`;
const CANON_SOURCE = `modules/${MODULE_ID}/data/canon/canon_power_levels_curated.json`;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
let legacyNpcSeedPromise = null;

function canUseGmTools() {
  if (game.user?.isGM) return true;
  ui.notifications?.warn("GM only.");
  return false;
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load ${path}: ${response.status}`);
  return response.json();
}

function gmWhisperData() {
  return ChatMessage.getWhisperRecipients("GM").map(user => user.id);
}

function actorCalibration(actor) {
  const system = actor?.system ?? {};
  const characteristics = system.characteristics ?? {};
  const scaling = system.powerScaling ?? {};
  return game.dbzf.calculatePowerCalibration({
    basePhysical: characteristics.physical?.base ?? 0,
    baseMental: characteristics.mental?.base ?? 0,
    experienceTotal: system.experience?.total ?? 0,
    currentBattlePower: system.resources?.battlePower?.effective ?? system.resources?.battlePower?.value ?? 0,
    powerScaling: scaling
  });
}

async function openPowerCalibrationTool(actor = canvas.tokens.controlled[0]?.actor ?? game.user.character) {
  if (!canUseGmTools()) return null;
  if (!actor) return ui.notifications.warn("Select an actor or assign a user character first.");
  const calibration = actorCalibration(actor);
  const bp = actor.system.resources?.battlePower ?? {};
  const content = `
    <article class="dbzf-gm-report">
      <h2>${escapeHtml(actor.name)} Power Calibration</h2>
      <div class="dbzf-gm-report-grid">
        <div><strong>Actual Battle Power</strong><span>${bp.value ?? 0}</span></div>
        <div><strong>Effective Battle Power</strong><span>${bp.effective ?? 0}</span></div>
        <div><strong>Suggested Battle Power</strong><span>${calibration.suggestedBattlePower}</span></div>
        <div><strong>Strict Formula</strong><span>${calibration.strictFormulaBattlePower}</span></div>
        <div><strong>XP Band Suggestion</strong><span>${calibration.xpBandSuggestedBattlePower}</span></div>
        <div><strong>XP From Current BP</strong><span>${calibration.xpFromCurrentBattlePower}</span></div>
        <div><strong>Band Envelope</strong><span>${calibration.lowerBandBattlePower} - ${calibration.upperBandBattlePower}</span></div>
        <div><strong>Canon/Strict Ratio</strong><span>${calibration.canonToStrictRatio}</span></div>
      </div>
      <p>Suggestions are diagnostics. They do not change actual Battle Power until a GM explicitly applies one.</p>
    </article>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmWhisperData(),
    content
  });
  return calibration;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

async function applySuggestedBattlePower(actor) {
  if (!canUseGmTools()) return null;
  if (!actor) return ui.notifications.warn("No actor selected.");
  const value = Number(actor.system.powerScaling?.suggestedBattlePower ?? actor.system.resources?.battlePower?.suggested ?? 0);
  if (!Number.isFinite(value) || value <= 0) return ui.notifications.warn("No positive suggested Battle Power is available.");
  await actor.update({ "system.resources.battlePower.value": Math.round(value) });
  ui.notifications.info(`${actor.name} Battle Power set to ${Math.round(value)}.`);
  return Math.round(value);
}

async function loadNpcSource() {
  return loadJson(NPC_SOURCE);
}

async function auditLegacyTransformationConversions() {
  if (!canUseGmTools()) return null;
  const source = await loadNpcSource();
  const converted = [];
  for (const actor of source.actors ?? []) {
    for (const item of actor.items ?? []) {
      if (item.type !== "transformation") continue;
      if (item.flags?.dbzFuzionLegacy?.convertedFrom !== "technique") continue;
      converted.push({
        actor: actor.name,
        item: item.name,
        effects: item.system?.effects?.length ?? 0
      });
    }
  }
  return {
    convertedCount: converted.length,
    withEffects: converted.filter(entry => entry.effects > 0).length,
    examples: converted.filter(entry => /monster form|demon back|magic burst/i.test(entry.item)).slice(0, 10),
    converted
  };
}

async function npcSeederDryRun() {
  if (!canUseGmTools()) return null;
  const source = await loadNpcSource();
  return {
    included: source.actors?.length ?? 0,
    excluded: source.excludedFormSheets?.length ?? 0,
    pack: `${MODULE_ID}.legacy-npcs`,
    actorType: "character",
    sampleNames: (source.actors ?? []).slice(0, 5).map(actor => actor.name)
  };
}

function prepareNpcActorData(record) {
  const actor = foundry.utils.deepClone(record);
  actor.type = "character";
  actor.flags ??= {};
  actor.flags.dbzFuzionLegacy = {
    importedBy: MODULE_ID,
    importedAt: new Date().toISOString(),
    source: "dbzf_npc_compendium_source.json",
    importedAs: "character",
    isNpc: true,
    preserveManualBattlePower: true
  };
  actor.system ??= {};
  actor.system.powerScaling ??= {};
  actor.system.powerScaling.battlePowerMode = actor.system.powerScaling.battlePowerMode || "manual";
  actor.system.powerScaling.preserveManualBattlePower = true;
  return actor;
}

async function seedLegacyNpcCompendium({ dryRun = false } = {}) {
  if (!canUseGmTools()) return null;
  if (legacyNpcSeedPromise) {
    ui.notifications?.warn("Legacy NPC seeding is already running.");
    return legacyNpcSeedPromise;
  }
  legacyNpcSeedPromise = seedLegacyNpcCompendiumUnlocked({ dryRun }).finally(() => {
    legacyNpcSeedPromise = null;
  });
  return legacyNpcSeedPromise;
}

async function seedLegacyNpcCompendiumUnlocked({ dryRun = false } = {}) {
  const source = await loadNpcSource();
  const dryRunResult = await npcSeederDryRun();
  if (dryRun) return dryRunResult;
  const pack = game.packs.get(`${MODULE_ID}.legacy-npcs`);
  if (!pack) throw new Error("Legacy NPC compendium pack is not available.");
  if (typeof pack.configure === "function") await pack.configure({ locked: false });
  else pack.locked = false;
  const index = await pack.getIndex({ fields: ["name", "type"] });
  const existingByName = new Map();
  const duplicateIds = [];
  for (const entry of index) {
    const bucket = existingByName.get(entry.name) ?? [];
    bucket.push(entry);
    existingByName.set(entry.name, bucket);
  }
  const sourceByName = new Map();
  for (const record of source.actors ?? []) {
    if (!sourceByName.has(record.name)) sourceByName.set(record.name, record);
  }
  let created = 0;
  let updated = 0;
  let replacedWrongType = 0;
  let removedDuplicates = 0;

  for (const record of sourceByName.values()) {
    const data = prepareNpcActorData(record);
    const matches = existingByName.get(record.name) ?? [];
    const characterEntry = matches.find(entry => entry.type === "character");
    const staleEntries = matches.filter(entry => entry._id !== characterEntry?._id);
    duplicateIds.push(...staleEntries.map(entry => entry._id));
    removedDuplicates += staleEntries.length;

    if (characterEntry) {
      const document = await pack.getDocument(characterEntry._id);
      await document.update(data);
      updated += 1;
    } else {
      if (matches.length) replacedWrongType += matches.length;
      const actor = new Actor.implementation(data);
      const imported = await pack.importDocument(actor);
      existingByName.set(record.name, [{ _id: imported.id, name: record.name, type: "character" }]);
      created += 1;
    }
  }
  if (duplicateIds.length && typeof pack.deleteDocuments === "function") await pack.deleteDocuments(duplicateIds);
  else if (duplicateIds.length) {
    for (const id of duplicateIds) {
      const document = await pack.getDocument(id);
      await document?.delete();
    }
  }

  return {
    ...dryRunResult,
    created,
    updated,
    replacedWrongType,
    removedDuplicates,
    uniqueSourceActors: sourceByName.size,
    total: created + updated
  };
}

async function loadCanonPowerRows() {
  if (!canUseGmTools()) return null;
  const source = await loadJson(CANON_SOURCE);
  return source.rows ?? [];
}

async function findCanonRows(name) {
  if (!canUseGmTools()) return null;
  const needle = String(name ?? "").trim().toLowerCase();
  if (!needle) return [];
  const rows = await loadCanonPowerRows();
  return rows.filter(row => String(row.character ?? "").toLowerCase().includes(needle));
}

class DBZFGmToolsPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dbzf-gm-tools-panel",
    classes: ["dbzf-gm-tools-app"],
    position: { width: 620, height: 640 },
    window: { title: "DBZ Fuzion GM Tools", resizable: true }
  };

  static PARTS = {
    panel: {
      template: `modules/${MODULE_ID}/templates/gm-panel.hbs`
    }
  };

  constructor(options = {}) {
    super(options);
    this.result = null;
    this.canonRows = [];
    this.busy = false;
    this._closing = false;
  }

  async close(options = {}) {
    this._closing = true;
    return super.close(options);
  }

  render(options = {}) {
    if (!canUseGmTools()) return this;
    return super.render(options);
  }

  async _prepareContext(options) {
    if (!canUseGmTools()) return { isGM: false };
    const controlledActor = canvas.tokens.controlled[0]?.actor ?? game.user.character ?? null;
    const pack = game.packs.get(`${MODULE_ID}.legacy-npcs`);
    return {
      isGM: game.user.isGM,
      actor: controlledActor,
      result: this.result,
      resultString: this.result ? JSON.stringify(this.result, null, 2) : "",
      busy: this.busy,
      canonRows: this.canonRows.slice(0, 12),
      packLabel: pack?.metadata?.label ?? "DBZ Fuzion Legacy NPCs",
      packCount: pack ? (await pack.getIndex()).size : 0
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.addEventListener("click", this.#onClick.bind(this));
    this.element.addEventListener("submit", this.#onSubmit.bind(this));
  }

  async #onClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    event.preventDefault();
    if (!canUseGmTools()) return;
    if (this.busy) return ui.notifications.warn("GM tools are already processing a request.");
    const action = button.dataset.action;
    this.busy = true;
    try {
      if (action === "dry-run") this.result = await npcSeederDryRun();
      if (action === "seed-npcs") this.result = await seedLegacyNpcCompendium();
      if (action === "calibration-report") this.result = await openPowerCalibrationTool();
      if (action === "apply-suggested") this.result = await applySuggestedBattlePower(canvas.tokens.controlled[0]?.actor ?? game.user.character);
    } finally {
      this.busy = false;
    }
    if (!this._closing && this.rendered) this.render({ force: true });
  }

  async #onSubmit(event) {
    event.preventDefault();
    if (!canUseGmTools()) return;
    const form = new FormData(event.target);
    const query = form.get("canonSearch");
    if (this.busy) return ui.notifications.warn("GM tools are already processing a request.");
    this.busy = true;
    try {
      this.canonRows = await findCanonRows(query);
      this.result = { canonMatches: this.canonRows.length, query };
    } finally {
      this.busy = false;
    }
    if (!this._closing && this.rendered) this.render({ force: true });
  }
}

function openGmToolsPanel() {
  if (!canUseGmTools()) return null;
  return new DBZFGmToolsPanel().render(true);
}

Hooks.once("init", () => {
  game.settings.registerMenu(MODULE_ID, "panel", {
    name: "DBZ Fuzion GM Tools",
    label: "Open GM Tools",
    hint: "Open calibration reports, canon lookup, and legacy NPC seeding tools.",
    icon: "fas fa-user-shield",
    type: DBZFGmToolsPanel,
    restricted: true
  });
});

Hooks.once("ready", () => {
  if (game.system.id !== SYSTEM_ID) return;
  if (!game.user?.isGM) return;
  game.dbzfGmTools = {
    canUseGmTools,
    openPanel: openGmToolsPanel,
    openPowerCalibrationTool,
    applySuggestedBattlePower,
    npcSeederDryRun,
    seedLegacyNpcCompendium,
    auditLegacyTransformationConversions,
    loadCanonPowerRows,
    findCanonRows
  };
});
