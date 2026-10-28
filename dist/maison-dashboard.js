/*!
 * Maison Dashboard — stratégie de dashboard Home Assistant, sombre et pensée pour le téléphone.
 * Accueil simple → bouton « Maison » (liste des pièces par étage) → page de la pièce.
 * Construit automatiquement à partir des étages, pièces et appareils de Home Assistant ; menu
 * Administration (administrateurs uniquement) pour personnaliser l'affichage.
 *
 * Installation : voir README.md. Dashboard :
 *   strategy:
 *     type: custom:maison-dashboard
 *
 * Licence MIT. Aucune dépendance (pas d'autre carte HACS requise).
 */
const MD_VERSION = "0.1.1";

/* ───────────────────────────── outils ───────────────────────────── */
const domainOf = (e) => e.split(".")[0];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const fmt = (v, d = 1) => (v === null || v === undefined || isNaN(v) ? "—" : Number(v).toFixed(d));
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function stateName(hass, id) {
  const st = hass.states[id];
  const reg = hass.entities?.[id];
  return st?.attributes?.friendly_name || reg?.name || id;
}
function navigate(path, replace = false) {
  if (replace) history.replaceState(null, "", path); else history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace } }));
}
function moreInfo(el, entityId) {
  el.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
}
function dashboardPath() {
  return location.pathname.split("/")[1] || "lovelace";
}

const FR = {
  home: "Accueil", house: "Maison", me: "Moi", admin: "Administration", hello_m: "Bonjour", hello_e: "Bonsoir",
  at_home: "À la maison", away: "Absent", alarm: "Alarme", lights: "Lumières", climate: "Chauffage", media: "Multimédia",
  covers: "Volets", cameras: "Caméras", vacuum: "Aspirateur", locks: "Serrures", all_off: "Tout éteindre", see_all: "Voir toutes",
  measured: "Mesurée", target: "Consigne", heating: "Chauffe", idle: "À l'arrêt", open: "Ouvrir", close: "Fermer", stop: "Stop",
  lock: "Verrouiller", unlock: "Déverrouiller", locked: "Verrouillé", unlocked: "Déverrouillé", nothing: "Rien en lecture",
  playing: "En lecture", paused: "En pause", room_control: "Contrôle de la pièce", save: "Enregistrer", saved: "Enregistré",
  not_admin: "Enregistrement refusé : seul un administrateur Home Assistant peut modifier ce dashboard.",
};
const PRESET_FR = { schedule: "Planning", manual: "Manuel", boost: "Boost", away: "Absent", frost_guard: "Hors-gel", eco: "Éco",
  comfort: "Confort", home: "Maison", sleep: "Nuit", activity: "Activité", none: "" };
const ALARM_FR = {
  disarmed: "Désarmée", armed_home: "Maison", armed_away: "Absent", armed_night: "Nuit", armed_vacation: "Vacances",
  armed_custom_bypass: "Personnalisé", arming: "Activation…", pending: "Entrée détectée", triggered: "ALARME", disarming: "Désarmement…",
};
const WEATHER_FR = {
  "clear-night": "Nuit claire", cloudy: "Nuageux", fog: "Brouillard", hail: "Grêle", lightning: "Orage", "lightning-rainy": "Orage",
  partlycloudy: "Éclaircies", pouring: "Averses", rainy: "Pluie", snowy: "Neige", "snowy-rainy": "Neige fondue", sunny: "Ensoleillé",
  windy: "Venteux", "windy-variant": "Venteux", exceptional: "Exceptionnel",
};
const WEATHER_ICON = {
  "clear-night": "weather-night", cloudy: "weather-cloudy", fog: "weather-fog", hail: "weather-hail", lightning: "weather-lightning",
  "lightning-rainy": "weather-lightning-rainy", partlycloudy: "weather-partly-cloudy", pouring: "weather-pouring", rainy: "weather-rainy",
  snowy: "weather-snowy", "snowy-rainy": "weather-snowy-rainy", sunny: "weather-sunny", windy: "weather-windy", "windy-variant": "weather-windy-variant",
};

/* ───────────────────────────── modèle (découverte) ───────────────────────────── */
/* Lit les registres de HA (étages, pièces, appareils, entités) et regroupe ce qui est pilotable par pièce. */
function buildModel(hass, cfg) {
  const ents = hass.entities || {};
  const devs = hass.devices || {};
  const areas = hass.areas || {};
  const floors = hass.floors || {};
  const user = hass.user || {};
  const prefs = (cfg.users || {})[user.id] || {};
  const hiddenRooms = new Set([...(cfg.hidden_rooms || []), ...(prefs.hidden_rooms || [])]);
  const hiddenEnt = new Set([...(cfg.hidden_entities || []), ...(prefs.hidden_entities || [])]);

  const areaOf = (id) => {
    const r = ents[id];
    if (!r) return null;
    return r.area_id || (r.device_id && devs[r.device_id]?.area_id) || null;
  };
  const usable = (id) => {
    const r = ents[id];
    const st = hass.states[id];
    if (!st || hiddenEnt.has(id)) return false;
    if (r && (r.hidden || r.entity_category)) return false;
    if (st.attributes?.hidden) return false;
    return true;
  };

  const rooms = {};
  const roomOrder = cfg.room_order || [];
  for (const a of Object.values(areas)) {
    if (hiddenRooms.has(a.area_id)) continue;
    const rc = (cfg.rooms || {})[a.area_id] || {};
    rooms[a.area_id] = {
      id: a.area_id, name: rc.name || a.name, icon: rc.icon || a.icon || "mdi:texture-box", floor: a.floor_id || null,
      picture: rc.picture || a.picture || null, temp_entity: rc.temperature || a.temperature_entity_id || null,
      lights: [], climates: [], medias: [], covers: [], locks: [], cameras: [], vacuums: [], fans: [], temps: [],
    };
  }
  const global = { lights: [], climates: [], medias: [], covers: [], locks: [], cameras: [], vacuums: [], alarms: [], weathers: [], persons: [], calendars: [], todos: [] };
  for (const id of Object.keys(hass.states)) {
    const d = domainOf(id);
    const st = hass.states[id];
    if (d === "person") { global.persons.push(id); continue; }
    if (d === "weather") { global.weathers.push(id); continue; }
    if (d === "calendar") { global.calendars.push(id); continue; }
    if (d === "todo") { global.todos.push(id); continue; }
    if (!usable(id)) continue;
    if (d === "media_player" && /browser_mod/.test(id)) continue;
    if (d === "light" && /browser_mod/.test(id)) continue;
    const a = areaOf(id);
    const room = a && rooms[a];
    const key = { light: "lights", climate: "climates", media_player: "medias", cover: "covers", lock: "locks", camera: "cameras",
                  vacuum: "vacuums", fan: "fans", alarm_control_panel: "alarms" }[d];
    if (key) {
      if (key === "alarms") { global.alarms.push(id); continue; }
      global[key]?.push(id);
      if (room) room[key].push(id);
      continue;
    }
    if (d === "sensor" && st.attributes.device_class === "temperature" && room) room.temps.push(id);
  }
  // Groupes de lumières : on masque les membres d'un groupe présent dans la même pièce
  for (const r of Object.values(rooms)) {
    const members = new Set();
    for (const l of r.lights) for (const m of hass.states[l]?.attributes?.entity_id || []) members.add(m);
    r.lights = r.lights.filter((l) => !members.has(l));
    if (!r.temp_entity && r.temps.length) r.temp_entity = r.temps[0];
    r.empty = !(r.lights.length || r.climates.length || r.medias.length || r.covers.length || r.locks.length || r.cameras.length || r.vacuums.length || r.fans.length);
  }
  // Étages
  // Étages : niveaux 0, 1, 2… d'abord, puis les niveaux négatifs (extérieur, sous-sol)
  const lv = (f) => { const l = f.level ?? 0; return l < 0 ? 1000 - l : l; };
  const fl = Object.values(floors).sort((a, b) => lv(a) - lv(b));
  const sortRooms = (list) => list.sort((a, b) => {
    const ia = roomOrder.indexOf(a.id), ib = roomOrder.indexOf(b.id);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.name.localeCompare(b.name);
  });
  const groups = [];
  for (const f of fl) {
    const list = sortRooms(Object.values(rooms).filter((r) => r.floor === f.floor_id && !r.empty));
    if (list.length) groups.push({ id: f.floor_id, name: f.name, rooms: list });
  }
  const sans = sortRooms(Object.values(rooms).filter((r) => (!r.floor || !floors[r.floor]) && !r.empty));
  if (sans.length) groups.push({ id: "_", name: groups.length ? "Autres" : "Pièces", rooms: sans });

  const me = global.persons.find((p) => hass.states[p]?.attributes?.user_id === user.id) || null;
  const hc = cfg.home_cameras && cfg.home_cameras.length ? cfg.home_cameras.filter((c) => hass.states[c] && !hiddenEnt.has(c))
            : global.cameras.slice(0, 2);
  return {
    rooms, groups, global, me, prefs,
    alarm: cfg.alarm || global.alarms[0] || null,
    weather: cfg.weather || global.weathers[0] || null,
    homeCameras: hc,
    locks: (cfg.locks && cfg.locks.length ? cfg.locks : global.locks).filter((l) => hass.states[l] && !hiddenEnt.has(l)),
  };
}

/* ───────────────────────────── stratégie ───────────────────────────── */
class MaisonDashboardStrategy {
  static async generate(config, hass) {
    const cfg = config || {};
    const model = buildModel(hass, cfg);
    const card = (page, extra = {}) => ({ type: "custom:maison-page", page, config: cfg, ...extra });
    const views = [{ title: FR.home, path: "home", type: "panel", cards: [card("home")] }];
    const sub = (title, path, page, extra) => views.push({ title, path, type: "panel", subview: true, cards: [card(page, extra)] });
    if (model.global.cameras.length) sub(FR.cameras, "cameras", "cameras");
    if (model.global.climates.length) sub(FR.climate, "climate", "climate");
    if (model.global.covers.length) sub(FR.covers, "covers", "covers");
    if (model.global.vacuums.length) sub(FR.vacuum, "vacuum", "vacuum");
    sub(FR.me, "me", "me");
    for (const g of model.groups) for (const r of g.rooms) sub(r.name, "room-" + r.id, "room", { room: r.id });
    if (hass.user?.is_admin || cfg.debug_admin) sub(FR.admin, "admin", "admin");
    const out = { title: cfg.title || FR.house, views };
    if (cfg.kiosk_mode) out.kiosk_mode = cfg.kiosk_mode; // pris en compte si kiosk-mode (HACS) est installé
    return out;
  }
}
customElements.define("ll-strategy-dashboard-maison-dashboard", MaisonDashboardStrategy);

/* ───────────────────────────── styles ───────────────────────────── */
const STYLE = (accent) => `
:host { --acc: ${accent}; --bg: #050a14; --card: rgba(15,25,45,.78); --card2: rgba(255,255,255,.05); --bord: rgba(110,160,255,.13);
  --txt: #e9eef8; --sub: #8b9bb9; --ok: #2ecc71; --warn: #ff9f43; --bad: #ff5c5c; --yel: #ffd54f;
  display: block; color: var(--txt); font-family: var(--ha-font-family-body, -apple-system, Roboto, sans-serif); }
.fond { position: fixed; inset: 0; z-index: -1; background:
  radial-gradient(900px 500px at 10% -5%, #11305a66, transparent 60%), radial-gradient(700px 500px at 110% 20%, #0b5f7a33, transparent 60%), var(--bg); }
.page { max-width: 540px; margin: 0 auto; padding: 8px 12px 170px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; }
.c { background: var(--card); border: 1px solid var(--bord); border-radius: 22px; padding: 14px; box-sizing: border-box;
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
.c2 { background: var(--card2); border: 1px solid var(--bord); border-radius: 16px; padding: 10px 12px; }
.row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.grow { flex: 1; min-width: 0; }
.t { font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px; padding: 4px 4px 0; }
.t ha-icon { color: var(--acc); --mdc-icon-size: 20px; }
.t .r { margin-left: auto; color: var(--acc); font-size: 14px; font-weight: 600; cursor: pointer; }
.big { font-size: 21px; font-weight: 800; line-height: 1.15; }
.sm { font-size: 12px; color: var(--sub); }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.tile { background: var(--card2); border: 1px solid var(--bord); border-radius: 18px; padding: 10px 4px; display: flex; flex-direction: column;
  align-items: center; gap: 4px; font-size: 12px; font-weight: 600; transition: transform .12s ease, background .2s; }
.tile:active, .rb:active, .chip:active { transform: scale(.96); }
.tile ha-icon { --mdc-icon-size: 26px; color: var(--acc); }
.tile.on { background: color-mix(in srgb, var(--acc) 18%, transparent); border-color: var(--acc); }
.rb { width: 44px; height: 44px; border-radius: 50%; background: var(--card2); border: 1px solid var(--bord); display: grid; place-items: center; flex: none; }
.rb ha-icon { --mdc-icon-size: 22px; }
.rb.main { width: 54px; height: 54px; background: var(--acc); border: none; color: #fff; }
.chip { background: color-mix(in srgb, var(--acc) 12%, transparent); border: 1px solid color-mix(in srgb, var(--acc) 40%, transparent);
  border-radius: 14px; padding: 8px 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.chip ha-icon { --mdc-icon-size: 18px; color: var(--acc); }
.ic { width: 40px; height: 40px; border-radius: 13px; display: grid; place-items: center; flex: none; background: color-mix(in srgb, var(--acc) 16%, transparent); }
.ic ha-icon { --mdc-icon-size: 22px; color: var(--acc); }
.sw { width: 46px; height: 28px; border-radius: 14px; background: rgba(255,255,255,.12); position: relative; flex: none; border: none; transition: background .2s; }
.sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: left .2s; }
.sw.on { background: var(--acc); } .sw.on::after { left: 21px; }
input[type=range] { width: 100%; accent-color: var(--acc); height: 26px; }
.cam { position: relative; border-radius: 18px; overflow: hidden; border: 1px solid var(--bord); background: #0a1324; aspect-ratio: 16/10; cursor: pointer; }
.cam img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cam span { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 12px 8px; font-weight: 700; background: linear-gradient(transparent, rgba(0,0,0,.75)); }
.hero { height: 200px; border-radius: 22px; overflow: hidden; position: relative; border: 1px solid var(--bord); padding: 12px; box-sizing: border-box; display: flex; align-items: flex-start; gap: 10px; }
.pill { padding: 6px 10px; border-radius: 14px; background: rgba(5,10,20,.6); text-align: center; border: 1px solid var(--bord); }
.pill b { display: block; font-size: 15px; }
.nav { position: fixed; z-index: 4; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 10px);
  width: min(516px, calc(100vw - 24px)); box-sizing: border-box; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
  background: rgba(10,18,34,.88); border: 1px solid var(--bord); border-radius: 26px; padding: 6px; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 10px 30px rgba(0,0,0,.5); }
.nav button { background: none; border: none; height: 52px; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 18px; }
.nav .m { background: color-mix(in srgb, var(--acc) 18%, transparent); padding: 0 22px; font-weight: 700; font-size: 15px; }
.nav .m ha-icon { color: var(--acc); }
.mini { position: fixed; z-index: 3; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 84px);
  width: min(516px, calc(100vw - 24px)); box-sizing: border-box; background: rgba(10,18,34,.92); border: 1px solid var(--bord); border-radius: 20px;
  padding: 8px 10px; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
.mini img { width: 42px; height: 42px; border-radius: 10px; object-fit: cover; }
.mini .rb { width: 38px; height: 38px; }
.ov { position: fixed; inset: 0; z-index: 8; background: rgba(5,10,20,.55); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  display: flex; align-items: flex-end; justify-content: center; animation: fade .18s ease; }
.sheet { width: min(540px, 100vw); max-height: 88vh; overflow: auto; background: rgba(10,18,34,.95); border: 1px solid var(--bord);
  border-radius: 28px 28px 0 0; padding: 16px 14px calc(env(safe-area-inset-bottom, 0px) + 20px); box-sizing: border-box; animation: up .22s ease; }
@keyframes up { from { transform: translateY(40px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
.floor { font-size: 12px; letter-spacing: 1.5px; color: var(--sub); font-weight: 700; text-transform: uppercase; padding: 10px 4px 4px; }
.badge { padding: 3px 8px; border-radius: 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 3px; }
.badge ha-icon { --mdc-icon-size: 14px; }
.keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-width: 280px; margin: 10px auto; }
.keys button { height: 54px; border-radius: 14px; border: none; background: rgba(255,255,255,.07); font-size: 21px; font-weight: 700; }
.dots { display: flex; gap: 14px; justify-content: center; margin: 8px 0; }
.dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--sub); } .dot.f { background: var(--acc); border-color: var(--acc); }
.tabs { display: flex; gap: 6px; overflow-x: auto; }
.tabs button { flex: none; border: 1px solid var(--bord); background: var(--card2); border-radius: 14px; padding: 8px 12px; font-weight: 600; font-size: 13px; }
.tabs button.on { background: color-mix(in srgb, var(--acc) 20%, transparent); border-color: var(--acc); }
input[type=text], select { width: 100%; box-sizing: border-box; background: rgba(255,255,255,.06); color: var(--txt); border: 1px solid var(--bord);
  border-radius: 12px; padding: 10px; font: inherit; }
.note { font-size: 12px; color: var(--sub); line-height: 1.4; }
.warn { color: var(--warn); }
.toast { position: fixed; z-index: 9; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top, 0px) + 12px); background: rgba(10,18,34,.95);
  border: 1px solid var(--acc); border-radius: 14px; padding: 10px 14px; font-size: 13px; }
`;

/* ───────────────────────────── carte « page » ───────────────────────────── */
class MaisonPage extends HTMLElement {
  setConfig(c) { this._c = c; this._cfg = c.config || {}; }
  getCardSize() { return 10; }
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (e) => this._click(e));
      this.shadowRoot.addEventListener("change", (e) => this._change(e));
      this.shadowRoot.addEventListener("pointerdown", () => { this._busy = true; });
      this.shadowRoot.addEventListener("pointerup", () => { setTimeout(() => { this._busy = false; this._render(); }, 600); });
      this._hash = () => { if (location.hash === "#maison") { this._ov = "rooms"; this._render(true); } };
      window.addEventListener("hashchange", this._hash);
    }
    clearInterval(this._timer);
    this._timer = setInterval(() => { this._camTick = Date.now(); this._refreshCams(); }, 10000);
    if (location.hash === "#maison" || new URLSearchParams(location.search).has("maison")) this._ov = "rooms";
    this._render(true);
  }
  disconnectedCallback() { clearInterval(this._timer); window.removeEventListener("hashchange", this._hash); }
  set hass(h) {
    const old = this._hass;
    this._hass = h;
    if (!old) { this._render(true); return; }
    if (this._watch && this._watch.some((id) => old.states[id] !== h.states[id])) this._render();
  }
  get hass() { return this._hass; }

  /* ---------- actions ---------- */
  _svc(dom, svc, data) {
    return this._hass.callService(dom, svc, data).catch((e) => this._toast("Erreur : " + (e.message || e)));
  }
  _toast(t) {
    const d = document.createElement("div"); d.className = "toast"; d.textContent = t;
    this.shadowRoot.appendChild(d); setTimeout(() => d.remove(), 3500);
  }
  _click(e) {
    const el = e.target.closest("[data-a]");
    if (!el) return;
    const a = el.dataset.a, id = el.dataset.id, v = el.dataset.v;
    const h = this._hass;
    const st = id ? h.states[id] : null;
    switch (a) {
      case "nav": navigate(v); break;
      case "back": if (history.length > 1) history.back(); else navigate("/" + dashboardPath() + "/home"); break;
      case "more": moreInfo(this, id); break;
      case "toggle": this._svc("homeassistant", "toggle", { entity_id: id }); break;
      case "off": this._svc(v, "turn_off", { entity_id: JSON.parse(el.dataset.ids) }); break;
      case "rooms": this._ov = "rooms"; this._render(true); break;
      case "close": if (e.target === el || el.tagName === "BUTTON") {
        this._ov = null; this._code = "";
        if (location.hash) history.replaceState(null, "", location.pathname);
        this._render(true);
      } break;
      case "media": this._svc("media_player", v, { entity_id: id }); break;
      case "cover": this._svc("cover", v, { entity_id: id }); break;
      case "lock": {
        const go = () => this._svc("lock", v, { entity_id: id });
        if (v === "unlock" && this._cfg.confirm_unlock && !confirm(FR.unlock + " : " + stateName(h, id) + " ?")) return;
        go(); break;
      }
      case "vac": this._svc("vacuum", v, { entity_id: id }); break;
      case "temp": {
        const step = st.attributes.target_temp_step || (h.config.unit_system?.temperature === "°F" ? 1 : 0.5);
        const cur = num(st.attributes.temperature) ?? num(st.attributes.current_temperature) ?? 20;
        const t = Math.min(st.attributes.max_temp ?? 35, Math.max(st.attributes.min_temp ?? 5, cur + step * Number(v)));
        this._svc("climate", "set_temperature", { entity_id: id, temperature: t }); break;
      }
      case "arm": {
        const need = st.attributes.code_arm_required && st.attributes.code_format;
        if (need) { this._ov = "code:" + v; this._codeEnt = id; this._code = ""; this._render(true); }
        else this._svc("alarm_control_panel", "alarm_" + v, { entity_id: id });
        break;
      }
      case "disarm": {
        if (st.attributes.code_format) { this._ov = "code:disarm"; this._codeEnt = id; this._code = ""; this._render(true); }
        else this._svc("alarm_control_panel", "alarm_disarm", { entity_id: id });
        break;
      }
      case "key": {
        if (v === "C") this._code = ""; else if (v === "<") this._code = (this._code || "").slice(0, -1);
        else if ((this._code || "").length < 10) this._code = (this._code || "") + v;
        this._render(true); break;
      }
      case "send": {
        const act = this._ov.split(":")[1];
        const code = this._code; this._code = "";
        this._ov = null; this._render(true);
        this._svc("alarm_control_panel", "alarm_" + act, { entity_id: this._codeEnt, code });
        break;
      }
      case "tab": this._tab = v; this._render(true); break;
      case "adm": this._admin(el); break;
    }
  }
  _change(e) {
    const el = e.target;
    if (el.dataset.a === "bri") this._svc("light", "turn_on", { entity_id: el.dataset.id, brightness_pct: Number(el.value) });
    if (el.dataset.a === "vol") this._svc("media_player", "volume_set", { entity_id: el.dataset.id, volume_level: Number(el.value) / 100 });
    if (el.dataset.a === "pos") this._svc("cover", "set_cover_position", { entity_id: el.dataset.id, position: Number(el.value) });
    if (el.dataset.adm) this._admin(el);
  }

  /* ---------- rendu ---------- */
  _render(force) {
    if (!this.shadowRoot || !this._hass || !this._c) return;
    if (this._busy && !force) return;
    const h = this._hass;
    this._model = buildModel(h, this._cfg);
    this._watch = [];
    const page = this._c.page;
    let body = "";
    try {
      if (page === "home") body = this._home();
      else if (page === "room") body = this._room(this._model.rooms[this._c.room]);
      else if (page === "cameras") body = this._cameras();
      else if (page === "climate") body = this._climatePage();
      else if (page === "covers") body = this._coversPage();
      else if (page === "vacuum") body = this._vacuumPage();
      else if (page === "me") body = this._me();
      else if (page === "admin") body = this._adminPage();
    } catch (err) {
      body = `<div class="c warn">Erreur d'affichage : ${esc(err.message)}</div>`;
      console.error("maison-dashboard", err);
    }
    const accent = this._cfg.accent || "#29b6f6";
    const ov = this._overlay();
    const mini = page !== "home" ? this._mini() : "";
    this.shadowRoot.innerHTML = `<style>${STYLE(accent)}</style><div class="fond"></div><div class="page">${body}</div>${mini}${this._nav()}${ov}`;
    if (page === "me") this._mountNative();
  }
  _w(...ids) { for (const i of ids) if (i) this._watch.push(i); }
  _base() { return "/" + dashboardPath(); }

  _nav() {
    const b = this._base();
    const right = this._hass.user?.is_admin ? `<button data-a="nav" data-v="${b}/admin"><ha-icon icon="mdi:cog-outline"></ha-icon></button>`
                                            : `<button data-a="nav" data-v="${b}/me"><ha-icon icon="mdi:account-circle-outline"></ha-icon></button>`;
    return `<div class="nav"><button data-a="nav" data-v="${b}/home"><ha-icon icon="mdi:view-dashboard-outline"></ha-icon></button>
      <button class="m" data-a="rooms"><ha-icon icon="mdi:home"></ha-icon>${FR.house}</button>${right}</div>`;
  }

  _mini() {
    const h = this._hass;
    const p = this._model.global.medias.map((m) => h.states[m]).find((s) => s && s.state === "playing" && s.attributes.media_title);
    if (!p) return "";
    this._w(p.entity_id);
    const a = p.attributes;
    return `<div class="mini"><div class="row">${a.entity_picture ? `<img src="${esc(a.entity_picture)}">` : ""}
      <div class="grow" data-a="more" data-id="${p.entity_id}"><div class="ell" style="font-weight:700;font-size:13px">${esc(a.media_title)}</div>
      <div class="ell sm">${esc(a.media_artist || stateName(h, p.entity_id))}</div></div>
      <button class="rb" data-a="media" data-v="media_previous_track" data-id="${p.entity_id}"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
      <button class="rb main" style="width:38px;height:38px" data-a="media" data-v="media_play_pause" data-id="${p.entity_id}"><ha-icon icon="mdi:pause"></ha-icon></button>
      <button class="rb" data-a="media" data-v="media_next_track" data-id="${p.entity_id}"><ha-icon icon="mdi:skip-next"></ha-icon></button></div></div>`;
  }

  _overlay() {
    if (!this._ov) return "";
    if (this._ov === "rooms") {
      let rows = "";
      for (const g of this._model.groups) {
        rows += `<div class="floor">${esc(g.name)}</div>`;
        for (const r of g.rooms) rows += this._roomRow(r);
      }
      return `<div class="ov" data-a="close"><div class="sheet"><div class="row" style="margin-bottom:6px">
        <div class="ic"><ha-icon icon="mdi:home"></ha-icon></div><div class="big grow">${FR.house}</div>
        <button class="rb" data-a="close"><ha-icon icon="mdi:close"></ha-icon></button></div>
        <div style="display:flex;flex-direction:column;gap:8px">${rows}</div></div></div>`;
    }
    if (this._ov.startsWith("code:")) {
      const act = this._ov.split(":")[1];
      const n = (this._code || "").length;
      const dots = Array.from({ length: Math.max(4, n) }, (_, i) => `<div class="dot ${i < n ? "f" : ""}"></div>`).join("");
      const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "<"].map((k) =>
        `<button data-a="key" data-v="${k}">${k === "<" ? '<ha-icon icon="mdi:backspace-outline"></ha-icon>' : k}</button>`).join("");
      const lab = act === "disarm" ? FR.unlock.replace("Déverrouiller", "Désarmer") : "Activer : " + (ALARM_FR["armed_" + act.replace("arm_", "")] || act);
      return `<div class="ov" data-a="close"><div class="sheet"><div class="row"><div class="ic"><ha-icon icon="mdi:shield-key"></ha-icon></div>
        <div class="big grow">${esc(lab)}</div><button class="rb" data-a="close"><ha-icon icon="mdi:close"></ha-icon></button></div>
        <div class="dots">${dots}</div><div class="keys">${keys}</div>
        <button class="chip" style="width:100%;justify-content:center;padding:14px" data-a="send"><ha-icon icon="mdi:check"></ha-icon>Valider</button>
        <div class="note" style="text-align:center;margin-top:8px">Le code n'est ni affiché ni conservé ; il est vérifié par Home Assistant.</div></div></div>`;
    }
    return "";
  }

  _roomTemp(r) {
    const h = this._hass;
    const v = r.temp_entity && h.states[r.temp_entity] ? num(h.states[r.temp_entity].state) : null;
    if (v !== null) return v;
    const c = r.climates.map((x) => h.states[x]).find((s) => s && s.attributes.current_temperature !== undefined);
    return c ? num(c.attributes.current_temperature) : null;
  }
  _roomRow(r) {
    const h = this._hass;
    const on = r.lights.filter((l) => h.states[l]?.state === "on").length;
    const t = this._roomTemp(r);
    this._w(...r.lights, r.temp_entity);
    const playing = r.medias.some((m) => h.states[m]?.state === "playing");
    return `<div class="c2 row" style="cursor:pointer" data-a="nav" data-v="${this._base()}/room-${r.id}">
      <div class="ic" style="width:34px;height:34px;border-radius:11px"><ha-icon icon="${esc(r.icon)}" style="--mdc-icon-size:20px"></ha-icon></div>
      <div class="grow ell" style="font-weight:600;font-size:15px">${esc(r.name)}</div>
      ${t !== null ? `<span class="sm">${fmt(t)}°</span>` : ""}
      ${r.lights.length ? `<span class="badge" style="background:${on ? "rgba(255,213,79,.15)" : "rgba(255,255,255,.05)"};color:${on ? "var(--yel)" : "var(--sub)"}"><ha-icon icon="mdi:lightbulb"></ha-icon>${on}</span>` : ""}
      ${playing ? `<span class="badge" style="background:rgba(41,182,246,.15);color:var(--acc)"><ha-icon icon="mdi:music"></ha-icon></span>` : ""}
      <span class="sm" style="font-size:18px">›</span></div>`;
  }

  /* ---------- accueil ---------- */
  _home() {
    const h = this._hass, m = this._model, b = this._base();
    let out = "";
    // Profil + météo
    const p = m.me ? h.states[m.me] : null;
    this._w(m.me, m.weather);
    const nom = p ? p.attributes.friendly_name : (h.user?.name || "");
    const hr = new Date().getHours();
    const pic = p?.attributes?.entity_picture;
    const lieu = p ? (p.state === "home" ? FR.at_home : p.state === "not_home" ? FR.away : p.state) : "";
    const prof = `<div class="c row" style="cursor:pointer" data-a="nav" data-v="${b}/me">
      ${pic ? `<img src="${esc(pic)}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid color-mix(in srgb,var(--acc) 50%,transparent)">`
            : `<div class="ic" style="width:56px;height:56px;border-radius:50%;font-size:22px;font-weight:800">${esc(nom[0] || "?")}</div>`}
      <div class="grow"><div class="sm">${hr >= 18 || hr < 5 ? FR.hello_e : FR.hello_m},</div><div class="big ell">${esc(nom)}</div>
      ${lieu ? `<div style="font-size:12px;color:${p.state === "home" ? "var(--ok)" : "var(--sub)"}">● ${esc(lieu)}</div>` : ""}</div></div>`;
    let wcard = "";
    const w = m.weather && h.states[m.weather];
    if (w) wcard = `<div class="c row" style="cursor:pointer" data-a="more" data-id="${w.entity_id}"><ha-icon icon="mdi:${WEATHER_ICON[w.state] || "weather-cloudy"}" style="--mdc-icon-size:38px;color:#cfe3ff"></ha-icon>
      <div class="grow"><div class="big">${fmt(w.attributes.temperature)} ${esc(w.attributes.temperature_unit || "°C")}</div><div class="sm ell">${esc(WEATHER_FR[w.state] || w.state)}${w.attributes.humidity !== undefined ? " · " + w.attributes.humidity + " %" : ""}</div></div></div>`;
    out += wcard ? `<div style="display:grid;grid-template-columns:1.25fr 1fr;gap:10px">${prof}${wcard}</div>` : prof;
    // Alarme + serrures
    const blocks = [];
    if (m.alarm && h.states[m.alarm]) blocks.push(this._alarm(m.alarm));
    for (const l of m.locks.slice(0, 2)) blocks.push(this._lock(l));
    if (blocks.length) {
      const cols = blocks.length === 3 ? "1.5fr 1fr 1fr" : blocks.length === 2 ? "1.3fr 1fr" : "1fr";
      out += `<div style="display:grid;grid-template-columns:${cols};gap:10px">${blocks.join("")}</div>`;
      for (const l of m.locks.slice(2)) out += this._lock(l, true);
    }
    // Accès rapides
    const q = [];
    if (m.global.cameras.length) q.push(["cameras", FR.cameras, "mdi:cctv", "var(--acc)"]);
    if (m.global.covers.length) q.push(["covers", FR.covers, "mdi:window-shutter", "var(--acc)"]);
    if (m.global.climates.length) q.push(["climate", FR.climate, "mdi:radiator", "var(--warn)"]);
    if (m.global.vacuums.length) q.push(["vacuum", FR.vacuum, "mdi:robot-vacuum", "var(--ok)"]);
    if (q.length) out += `<div style="display:grid;grid-template-columns:repeat(${q.length},1fr);gap:8px">${q.map(([p2, n, i, c]) =>
      `<button class="tile" data-a="nav" data-v="${b}/${p2}"><ha-icon icon="${i}" style="color:${c}"></ha-icon>${n}</button>`).join("")}</div>`;
    // Lecteur
    const mp = this._cfg.media_player || m.global.medias.find((x) => h.states[x]?.state === "playing") ||
               m.global.medias.find((x) => /spotify/.test(x));
    if (mp && h.states[mp]) out += this._player(mp, true);
    // Caméras
    if (m.homeCameras.length) {
      out += `<div class="t"><ha-icon icon="mdi:cctv"></ha-icon>${FR.cameras}<span class="r" data-a="nav" data-v="${b}/cameras">${FR.see_all} ›</span></div>`;
      out += `<div class="grid2">${m.homeCameras.slice(0, 2).map((c) => this._cam(c)).join("")}</div>`;
    }
    return out;
  }

  _alarm(id) {
    const h = this._hass, s = h.states[id], f = s.attributes.supported_features || 0;
    this._w(id);
    const col = s.state === "disarmed" ? "var(--ok)" : s.state === "triggered" ? "var(--bad)" : ["arming", "pending"].includes(s.state) ? "var(--warn)" : "var(--acc)";
    const modes = [["disarm", "Désarmé", "mdi:home", "disarmed"]];
    if (f & 4) modes.push(["arm_night", "Nuit", "mdi:weather-night", "armed_night"]);
    if (f & 2) modes.push(["arm_away", "Absent", "mdi:walk", "armed_away"]);
    if (f & 1 && !(f & 4)) modes.push(["arm_home", "Maison", "mdi:home-lock", "armed_home"]);
    const btn = modes.map(([act, lab, ic, stt]) =>
      `<button class="tile ${s.state === stt ? "on" : ""}" style="padding:8px 0;font-size:10px" data-a="${act === "disarm" ? "disarm" : "arm"}" data-v="${act}" data-id="${id}">
        <ha-icon icon="${ic}" style="--mdc-icon-size:22px;color:${s.state === stt ? "var(--acc)" : "var(--sub)"}"></ha-icon>${lab}</button>`).join("");
    return `<div class="c" style="padding:12px;display:flex;flex-direction:column;gap:10px">
      <div class="row" data-a="more" data-id="${id}" style="cursor:pointer"><div class="ic" style="background:color-mix(in srgb,${col} 18%,transparent)">
      <ha-icon icon="mdi:${s.state === "disarmed" ? "shield-check" : s.state === "triggered" ? "shield-alert" : "shield-lock"}" style="color:${col}"></ha-icon></div>
      <div class="grow"><div style="font-weight:800">${FR.alarm}</div><div style="font-size:13px;font-weight:700;color:${col}" class="ell">● ${esc(ALARM_FR[s.state] || s.state)}</div></div></div>
      <div style="display:grid;grid-template-columns:repeat(${modes.length},1fr);gap:6px">${btn}</div></div>`;
  }

  _lock(id, wide) {
    const h = this._hass, s = h.states[id];
    this._w(id);
    const ok = s.state === "locked";
    const c = ok ? "var(--ok)" : ["jammed", "unavailable"].includes(s.state) ? "var(--bad)" : "var(--warn)";
    const lab = { locked: FR.locked, unlocked: FR.unlocked, locking: "…", unlocking: "…", jammed: "Bloquée", open: "Ouvert", unavailable: "Indisponible" }[s.state] || s.state;
    return `<div class="c" style="padding:10px;display:flex;flex-direction:column;gap:8px;${wide ? "" : "align-items:center;text-align:center"}">
      <div data-a="more" data-id="${id}" style="cursor:pointer"><ha-icon icon="mdi:${ok ? "lock" : "lock-open-variant"}" style="color:${c};--mdc-icon-size:26px"></ha-icon>
      <div style="font-size:13px;font-weight:800" class="ell">${esc(stateName(h, id))}</div><div style="font-size:11px;color:${c}">${esc(lab)}</div></div>
      <div class="grid2" style="gap:6px;width:100%"><button class="tile" style="padding:6px 0;font-size:10px" data-a="lock" data-v="unlock" data-id="${id}"><ha-icon icon="mdi:lock-open-variant" style="--mdc-icon-size:20px"></ha-icon>${FR.open}</button>
      <button class="tile" style="padding:6px 0;font-size:10px" data-a="lock" data-v="lock" data-id="${id}"><ha-icon icon="mdi:lock" style="--mdc-icon-size:20px"></ha-icon>${FR.close}</button></div></div>`;
  }

  _player(id, full) {
    const h = this._hass, s = h.states[id], a = s.attributes;
    this._w(id);
    const etat = s.state === "playing" ? FR.playing : s.state === "paused" ? FR.paused : FR.nothing;
    const vol = a.volume_level !== undefined ? Math.round(a.volume_level * 100) : null;
    return `<div class="c" style="display:flex;flex-direction:column;gap:12px">
      <div class="row"><ha-icon icon="${/spotify/.test(id) ? "mdi:spotify" : "mdi:music-circle"}" style="--mdc-icon-size:34px;color:${/spotify/.test(id) ? "#1DB954" : "var(--acc)"}"></ha-icon>
        <div class="grow"><div style="font-weight:800" class="ell">${esc(stateName(h, id))}</div><div class="ell" style="font-size:12px;color:var(--acc)">${etat}${a.source ? " · " + esc(a.source) : ""}</div></div>
        <button class="chip" data-a="more" data-id="${id}"><ha-icon icon="mdi:speaker"></ha-icon>Sortie</button></div>
      <div class="row" data-a="more" data-id="${id}" style="cursor:pointer">${a.entity_picture ? `<img src="${esc(a.entity_picture)}" style="width:64px;height:64px;border-radius:14px;object-fit:cover">`
        : `<div class="ic" style="width:64px;height:64px"><ha-icon icon="mdi:music"></ha-icon></div>`}
        <div class="grow"><div class="ell" style="font-weight:700;font-size:15px">${esc(a.media_title || "—")}</div><div class="ell sm" style="font-size:13px">${esc(a.media_artist || "")}</div></div></div>
      <div class="row" style="justify-content:space-around">
        <button class="rb" data-a="media" data-v="media_previous_track" data-id="${id}"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
        <button class="rb main" data-a="media" data-v="media_play_pause" data-id="${id}"><ha-icon icon="mdi:${s.state === "playing" ? "pause" : "play"}"></ha-icon></button>
        <button class="rb" data-a="media" data-v="media_next_track" data-id="${id}"><ha-icon icon="mdi:skip-next"></ha-icon></button></div>
      ${vol !== null ? `<div class="row"><ha-icon icon="mdi:volume-medium" style="color:var(--sub)"></ha-icon><input type="range" min="0" max="100" value="${vol}" data-a="vol" data-id="${id}"><span class="sm">${vol}%</span></div>` : ""}</div>`;
  }

  _cam(id) {
    const h = this._hass, s = h.states[id];
    if (!s) return "";
    const src = s.attributes.entity_picture ? s.attributes.entity_picture + (s.attributes.entity_picture.includes("?") ? "&" : "?") + "t=" + Math.floor((this._camTick || Date.now()) / 10000) : "";
    return `<div class="cam" data-a="more" data-id="${id}">${src ? `<img data-cam="${id}" src="${esc(src)}" loading="lazy">` : ""}<span>${esc(stateName(h, id))}</span></div>`;
  }
  _refreshCams() {
    if (!this.shadowRoot || !this._hass) return;
    for (const img of this.shadowRoot.querySelectorAll("img[data-cam]")) {
      const s = this._hass.states[img.dataset.cam];
      if (s?.attributes?.entity_picture) img.src = s.attributes.entity_picture + (s.attributes.entity_picture.includes("?") ? "&" : "?") + "t=" + Date.now();
    }
  }

  /* ---------- pièce ---------- */
  _room(r) {
    if (!r) return `<div class="c">Pièce introuvable.</div>`;
    const h = this._hass;
    const t = this._roomTemp(r);
    const clim = r.climates.map((c) => h.states[c]).find(Boolean);
    this._w(r.temp_entity, ...r.climates);
    const bg = r.picture ? `linear-gradient(180deg,rgba(5,10,20,.1),rgba(5,10,20,.85)),url('${esc(r.picture)}') center/cover`
                         : `radial-gradient(120% 90% at 80% 0%, color-mix(in srgb, var(--acc) 30%, #1b2b4a), #0a1324 70%)`;
    let out = `<div class="hero" style="background:${bg}"><button class="rb" style="background:rgba(5,10,20,.55)" data-a="back"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
      <ha-icon icon="${esc(r.icon)}" style="color:var(--warn);--mdc-icon-size:26px;margin-top:9px"></ha-icon>
      <div class="grow"><div style="font-size:24px;font-weight:800" class="ell">${esc(r.name)}</div><div class="sm">${FR.room_control}</div></div>
      <div class="row" style="gap:6px">${t !== null ? `<div class="pill"><b>${fmt(t)} °</b><span class="sm">Actuelle</span></div>` : ""}
      ${clim && clim.attributes.temperature !== undefined ? `<div class="pill" style="border-color:color-mix(in srgb,var(--warn) 50%,transparent)"><b style="color:var(--warn)">${fmt(clim.attributes.temperature)} °</b><span class="sm">${FR.target}</span></div>` : ""}</div></div>`;
    if (r.lights.length) {
      out += `<div class="t"><ha-icon icon="mdi:lightbulb-group"></ha-icon>${FR.lights}<span class="r" data-a="off" data-v="light" data-ids='${esc(JSON.stringify(r.lights))}'><ha-icon icon="mdi:power" style="--mdc-icon-size:16px"></ha-icon> ${FR.all_off}</span></div>`;
      out += r.lights.map((l) => this._light(l)).join("");
    }
    if (r.fans.length) out += r.fans.map((f) => this._simple(f, "mdi:fan")).join("");
    if (r.climates.length) out += `<div class="t"><ha-icon icon="mdi:radiator"></ha-icon>${FR.climate}</div>` + r.climates.map((c) => this._climate(c)).join("");
    if (r.covers.length) out += `<div class="t"><ha-icon icon="mdi:window-shutter"></ha-icon>${FR.covers}</div>` + r.covers.map((c) => this._cover(c)).join("");
    if (r.medias.length) out += `<div class="t"><ha-icon icon="mdi:television-play"></ha-icon>${FR.media}</div>` + r.medias.map((x) => this._player(x)).join("");
    if (r.locks.length) out += `<div class="t"><ha-icon icon="mdi:lock"></ha-icon>${FR.locks}</div>` + r.locks.map((x) => this._lock(x, true)).join("");
    if (r.vacuums.length) out += r.vacuums.map((v) => this._vacuum(v)).join("");
    if (r.cameras.length) out += `<div class="t"><ha-icon icon="mdi:cctv"></ha-icon>${FR.cameras}</div><div class="grid2">${r.cameras.map((c) => this._cam(c)).join("")}</div>`;
    return out;
  }

  _light(id) {
    const h = this._hass, s = h.states[id], a = s.attributes;
    this._w(id);
    const on = s.state === "on";
    const modes = a.supported_color_modes || [];
    const dim = modes.some((m) => m !== "onoff");
    const pct = a.brightness ? Math.round(a.brightness / 2.55) : 0;
    const rgb = a.rgb_color ? `rgb(${a.rgb_color.join(",")})` : "var(--yel)";
    return `<div class="c2" style="display:flex;flex-direction:column;gap:6px"><div class="row">
      <div class="ic" data-a="more" data-id="${id}" style="cursor:pointer;background:${on ? `color-mix(in srgb, ${rgb} 25%, transparent)` : "rgba(255,255,255,.06)"}">
      <ha-icon icon="${esc(a.icon || "mdi:lightbulb")}" style="color:${on ? rgb : "var(--sub)"}"></ha-icon></div>
      <div class="grow" data-a="more" data-id="${id}" style="cursor:pointer"><div class="ell" style="font-weight:600">${esc(stateName(h, id))}</div><div class="sm">${on ? (dim ? pct + " %" : "Allumée") : "Éteinte"}</div></div>
      <button class="sw ${on ? "on" : ""}" data-a="toggle" data-id="${id}" aria-label="Allumer / éteindre"></button></div>
      ${dim && on ? `<input type="range" min="1" max="100" value="${pct}" data-a="bri" data-id="${id}">` : ""}</div>`;
  }
  _simple(id, icon) {
    const h = this._hass, s = h.states[id];
    this._w(id);
    return `<div class="c2 row"><div class="ic"><ha-icon icon="${icon}"></ha-icon></div><div class="grow ell" data-a="more" data-id="${id}">${esc(stateName(h, id))}</div>
      <button class="sw ${s.state === "on" ? "on" : ""}" data-a="toggle" data-id="${id}"></button></div>`;
  }
  _climate(id, withName) {
    const h = this._hass, s = h.states[id], a = s.attributes;
    this._w(id);
    const chauffe = a.hvac_action === "heating" || a.hvac_action === "cooling";
    return `<div class="c" style="display:flex;flex-direction:column;gap:10px">
      ${withName ? `<div class="row" style="font-weight:700"><ha-icon icon="mdi:radiator" style="color:var(--warn)"></ha-icon>${esc(withName)}</div>` : ""}
      <div class="row" data-a="more" data-id="${id}" style="cursor:pointer;justify-content:space-between">
        <div><div class="big">${fmt(num(a.current_temperature))} °</div><div class="sm">${FR.measured}</div></div>
        <div style="text-align:right"><div class="big" style="color:var(--warn)">${fmt(num(a.temperature))} °</div><div class="sm">${FR.target}</div></div></div>
      <div class="row"><button class="rb" data-a="temp" data-v="-1" data-id="${id}"><ha-icon icon="mdi:minus"></ha-icon></button>
        <div class="grow" style="text-align:center;font-size:13px;color:${chauffe ? "var(--warn)" : "var(--sub)"}">● ${chauffe ? FR.heating : FR.idle}${a.preset_mode && PRESET_FR[a.preset_mode] !== "" ? " · " + esc(PRESET_FR[a.preset_mode] || a.preset_mode) : ""}</div>
        <button class="rb" data-a="temp" data-v="1" data-id="${id}"><ha-icon icon="mdi:plus"></ha-icon></button></div></div>`;
  }
  _cover(id) {
    const h = this._hass, s = h.states[id], a = s.attributes, f = a.supported_features || 0;
    this._w(id);
    const pos = a.current_position;
    return `<div class="c" style="display:flex;flex-direction:column;gap:10px"><div class="row" data-a="more" data-id="${id}" style="cursor:pointer">
      <div class="ic"><ha-icon icon="mdi:window-shutter"></ha-icon></div><div class="grow"><div style="font-weight:700" class="ell">${esc(stateName(h, id))}</div>
      <div class="sm">${esc({ open: "Ouvert", closed: "Fermé", opening: "Ouverture…", closing: "Fermeture…" }[s.state] || s.state)}${pos !== undefined ? " · " + pos + " %" : ""}</div></div></div>
      <div class="grid3"><button class="tile" data-a="cover" data-v="open_cover" data-id="${id}"><ha-icon icon="mdi:arrow-up"></ha-icon>${FR.open}</button>
      ${f & 8 ? `<button class="tile" data-a="cover" data-v="stop_cover" data-id="${id}"><ha-icon icon="mdi:stop"></ha-icon>${FR.stop}</button>` : "<span></span>"}
      <button class="tile" data-a="cover" data-v="close_cover" data-id="${id}"><ha-icon icon="mdi:arrow-down"></ha-icon>${FR.close}</button></div>
      ${f & 4 && pos !== undefined ? `<input type="range" min="0" max="100" value="${pos}" data-a="pos" data-id="${id}">` : ""}</div>`;
  }
  _vacuum(id) {
    const h = this._hass, s = h.states[id], a = s.attributes;
    this._w(id);
    const bat = a.battery_level;
    const fr = { docked: "Sur la base", cleaning: "Nettoyage", returning: "Retour à la base", paused: "En pause", idle: "En attente", error: "Erreur" }[s.state] || s.state;
    return `<div class="c" style="display:flex;flex-direction:column;gap:10px"><div class="row" data-a="more" data-id="${id}" style="cursor:pointer">
      <div class="ic"><ha-icon icon="mdi:robot-vacuum"></ha-icon></div><div class="grow"><div style="font-weight:700" class="ell">${esc(stateName(h, id))}</div>
      <div class="sm">${esc(fr)}${bat !== undefined ? " · " + bat + " %" : ""}</div></div></div>
      <div class="grid3"><button class="tile" data-a="vac" data-v="start" data-id="${id}"><ha-icon icon="mdi:play"></ha-icon>Démarrer</button>
      <button class="tile" data-a="vac" data-v="pause" data-id="${id}"><ha-icon icon="mdi:pause"></ha-icon>Pause</button>
      <button class="tile" data-a="vac" data-v="return_to_base" data-id="${id}"><ha-icon icon="mdi:home-import-outline"></ha-icon>Base</button></div></div>`;
  }

  /* ---------- pages globales ---------- */
  _head(t, icon) {
    return `<div class="row" style="margin-top:4px"><button class="rb" data-a="back"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
      <div class="ic"><ha-icon icon="${icon}"></ha-icon></div><div class="big grow">${esc(t)}</div></div>`;
  }
  _cameras() {
    const cams = this._model.global.cameras;
    return this._head(FR.cameras, "mdi:cctv") + `<div class="grid2">${cams.map((c) => this._cam(c)).join("")}</div>
      <div class="note">Touchez une caméra pour le direct.</div>`;
  }
  _climatePage() {
    const m = this._model;
    let out = this._head(FR.climate, "mdi:radiator");
    for (const g of m.groups) for (const r of g.rooms) for (const c of r.climates) out += this._climate(c, r.name);
    const sans = m.global.climates.filter((c) => !Object.values(m.rooms).some((r) => r.climates.includes(c)));
    for (const c of sans) out += this._climate(c, stateName(this._hass, c));
    return out;
  }
  _coversPage() { return this._head(FR.covers, "mdi:window-shutter") + this._model.global.covers.map((c) => this._cover(c)).join(""); }
  _vacuumPage() {
    const h = this._hass;
    let out = this._head(FR.vacuum, "mdi:robot-vacuum");
    for (const v of this._model.global.vacuums) {
      out += this._vacuum(v);
      const dev = h.entities?.[v]?.device_id;
      const map = dev && Object.values(h.entities).find((e) => e.device_id === dev && domainOf(e.entity_id) === "camera" && h.states[e.entity_id]);
      if (map) out += this._cam(map.entity_id);
    }
    return out;
  }

  /* ---------- espace personnel ---------- */
  _me() {
    const h = this._hass, m = this._model, mine = (this._cfg.users || {})[h.user?.id] || {};
    const p = m.me ? h.states[m.me] : null;
    let out = this._head(p ? p.attributes.friendly_name : (h.user?.name || FR.me), "mdi:account-circle");
    const cals = (mine.calendars || []).filter((c) => h.states[c]);
    const todos = (mine.todos || []).filter((t) => h.states[t]);
    if (!cals.length && !todos.length) out += `<div class="c note">Aucun agenda ni liste n'est encore associé à votre compte. Un administrateur peut les choisir dans Administration → Utilisateurs.</div>`;
    this._native = [];
    if (cals.length) { out += `<div class="t"><ha-icon icon="mdi:calendar-week"></ha-icon>Mon agenda</div><div data-native="0"></div>`; this._native.push({ type: "calendar", entities: cals, initial_view: "listWeek" }); }
    for (const t of todos) { out += `<div data-native="${this._native.length}"></div>`; this._native.push({ type: "todo-list", entity: t }); }
    return out;
  }
  async _mountNative() {
    if (!this._native?.length) return;
    const helpers = await window.loadCardHelpers?.();
    if (!helpers) return;
    this._nativeEls = this._nativeEls || {};
    for (const [i, conf] of this._native.entries()) {
      const slot = this.shadowRoot.querySelector(`[data-native="${i}"]`);
      if (!slot) continue;
      const key = JSON.stringify(conf);
      let el = this._nativeEls[key];
      if (!el) { el = helpers.createCardElement(conf); this._nativeEls[key] = el; }
      el.hass = this._hass;
      el.style.cssText = "--card-background-color:var(--card);--ha-card-background:var(--card);--primary-text-color:var(--txt);--secondary-text-color:var(--sub);--ha-card-border-radius:20px;";
      slot.appendChild(el);
    }
  }

  /* ---------- administration ---------- */
  _adminPage() {
    const h = this._hass;
    if (!h.user?.is_admin && !this._cfg.debug_admin) return `<div class="c">Réservé aux administrateurs.</div>`;
    if (!this._draft) {
      this._draft = JSON.parse(JSON.stringify(this._cfg || {}));
      delete this._draft.type;
      this._loadUsers();
    }
    const d = this._draft, tab = this._tab || "general";
    const tabs = [["general", "Général", "mdi:tune"], ["rooms", "Pièces", "mdi:home"], ["users", "Utilisateurs", "mdi:account-group"], ["log", "Journal", "mdi:history"]];
    let out = this._head(FR.admin, "mdi:cog") + `<div class="tabs">${tabs.map(([k, n, i]) =>
      `<button class="${tab === k ? "on" : ""}" data-a="tab" data-v="${k}"><ha-icon icon="${i}" style="--mdc-icon-size:16px"></ha-icon> ${n}</button>`).join("")}</div>`;
    const sel = (key, list, val, none = "Automatique") => `<select data-adm="set" data-k="${key}"><option value="">${none}</option>${list.map((e) =>
      `<option value="${e}" ${val === e ? "selected" : ""}>${esc(stateName(h, e))}</option>`).join("")}</select>`;
    const all = Object.keys(h.states).filter((e) => !/browser_mod/.test(e) && h.states[e].state !== "unavailable");
    if (tab === "general") {
      out += `<div class="c" style="display:flex;flex-direction:column;gap:10px">
        <label class="sm">Titre</label><input type="text" data-adm="set" data-k="title" value="${esc(d.title || "")}" placeholder="${FR.house}">
        <label class="sm">Couleur d'accent</label><input type="text" data-adm="set" data-k="accent" value="${esc(d.accent || "#29b6f6")}">
        <label class="sm">Météo</label>${sel("weather", all.filter((e) => domainOf(e) === "weather"), d.weather)}
        <label class="sm">Alarme</label>${sel("alarm", all.filter((e) => domainOf(e) === "alarm_control_panel"), d.alarm)}
        <label class="sm">Lecteur de l'accueil</label>${sel("media_player", all.filter((e) => domainOf(e) === "media_player"), d.media_player)}
        <div class="row"><div class="grow">Confirmer avant de déverrouiller</div><button class="sw ${d.confirm_unlock ? "on" : ""}" data-a="adm" data-op="flag" data-k="confirm_unlock"></button></div>
        <label class="sm">Caméras de l'accueil (2 max)</label>${all.filter((e) => domainOf(e) === "camera").map((c) =>
          `<div class="row"><div class="grow ell">${esc(stateName(h, c))}</div><button class="sw ${(d.home_cameras || []).includes(c) ? "on" : ""}" data-a="adm" data-op="list" data-k="home_cameras" data-id="${c}"></button></div>`).join("")}
        <label class="sm">Serrures affichées (vide = toutes)</label>${all.filter((e) => domainOf(e) === "lock").map((c) =>
          `<div class="row"><div class="grow ell">${esc(stateName(h, c))}</div><button class="sw ${(d.locks || []).includes(c) ? "on" : ""}" data-a="adm" data-op="list" data-k="locks" data-id="${c}"></button></div>`).join("")}
      </div>`;
    }
    if (tab === "rooms") {
      const areas = Object.values(h.areas || {}).sort((a, b) => {
        const o = d.room_order || []; const ia = o.indexOf(a.area_id), ib = o.indexOf(b.area_id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.name.localeCompare(b.name);
      });
      out += `<div class="note">Pièces = zones de Home Assistant (Paramètres → Zones, étages). Ordre, visibilité et photo s'appliquent à tout le monde.</div>`;
      out += areas.map((a, i) => {
        const rc = (d.rooms || {})[a.area_id] || {};
        const hidden = (d.hidden_rooms || []).includes(a.area_id);
        return `<div class="c2" style="display:flex;flex-direction:column;gap:8px"><div class="row">
          <ha-icon icon="${esc(rc.icon || a.icon || "mdi:texture-box")}" style="color:var(--acc)"></ha-icon><div class="grow ell" style="font-weight:600">${esc(a.name)}</div>
          <button class="rb" style="width:34px;height:34px" data-a="adm" data-op="up" data-id="${a.area_id}"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="sw ${hidden ? "" : "on"}" data-a="adm" data-op="list" data-k="hidden_rooms" data-id="${a.area_id}" data-inv="1"></button></div>
          <input type="text" placeholder="Photo (URL, ex. /local/pieces/${a.area_id}.jpg)" data-adm="room" data-id="${a.area_id}" data-f="picture" value="${esc(rc.picture || "")}">
          <input type="text" placeholder="Icône (ex. mdi:sofa)" data-adm="room" data-id="${a.area_id}" data-f="icon" value="${esc(rc.icon || "")}"></div>`;
      }).join("");
    }
    if (tab === "users") {
      out += `<div class="note warn">Masquer une pièce ou une caméra pour un utilisateur ne fait que l'enlever de l'affichage : Home Assistant ne propose pas de droits par entité, l'API reste accessible à tout compte connecté.</div>`;
      if (!this._users) out += `<div class="c sm">Chargement des comptes…</div>`;
      else if (this._usersErr) out += `<div class="c sm warn">Liste des comptes refusée par Home Assistant (${esc(this._usersErr)}) : réservée aux administrateurs.</div>`;
      else for (const u of this._users) {
        const pu = (d.users || {})[u.id] || {};
        const person = this._model.global.persons.map((p) => h.states[p]).find((p) => p.attributes.user_id === u.id);
        const open = this._openUser === u.id;
        const role = u.group_ids?.includes("system-admin") ? "Administrateur" : u.group_ids?.includes("system-read-only") ? "Lecture seule" : "Membre";
        out += `<div class="c" style="display:flex;flex-direction:column;gap:10px"><div class="row" style="cursor:pointer" data-a="adm" data-op="user" data-id="${u.id}">
          ${person?.attributes?.entity_picture ? `<img src="${esc(person.attributes.entity_picture)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`
            : `<div class="ic" style="border-radius:50%">${esc((u.name || "?")[0])}</div>`}
          <div class="grow"><div style="font-weight:700">${esc(u.name)}</div><div class="sm">${role}${person ? " · " + (person.state === "home" ? FR.at_home : person.state === "not_home" ? FR.away : esc(person.state)) : ""}</div></div>
          <span class="sm" style="font-size:18px">${open ? "⌄" : "›"}</span></div>`;
        if (open) {
          const tg = (k, id, inv) => `<button class="sw ${(pu[k] || []).includes(id) === !inv ? "on" : ""}" data-a="adm" data-op="ulist" data-u="${u.id}" data-k="${k}" data-id="${id}"></button>`;
          out += `<div class="floor">Pièces visibles</div>` + Object.values(h.areas || {}).map((a) =>
            `<div class="row"><div class="grow ell">${esc(a.name)}</div>${tg("hidden_rooms", a.area_id, true)}</div>`).join("");
          out += `<div class="floor">Caméras visibles</div>` + all.filter((e) => domainOf(e) === "camera").map((c) =>
            `<div class="row"><div class="grow ell">${esc(stateName(h, c))}</div>${tg("hidden_entities", c, true)}</div>`).join("");
          out += `<div class="floor">Serrures visibles</div>` + all.filter((e) => domainOf(e) === "lock").map((c) =>
            `<div class="row"><div class="grow ell">${esc(stateName(h, c))}</div>${tg("hidden_entities", c, true)}</div>`).join("");
          out += `<div class="floor">Agendas (espace personnel)</div>` + all.filter((e) => domainOf(e) === "calendar").map((c) =>
            `<div class="row"><div class="grow ell">${esc(stateName(h, c))}</div>${tg("calendars", c, false)}</div>`).join("");
          out += `<div class="floor">Listes (espace personnel)</div>` + all.filter((e) => domainOf(e) === "todo").map((c) =>
            `<div class="row"><div class="grow ell">${esc(stateName(h, c))}</div>${tg("todos", c, false)}</div>`).join("");
        }
        out += `</div>`;
      }
    }
    if (tab === "log") {
      const log = (d.journal || []).slice().reverse();
      out += log.length ? log.map((j) => `<div class="c2"><div style="font-weight:600">${esc(j.quoi)}</div><div class="sm">${esc(j.qui)} · ${esc(new Date(j.quand).toLocaleString())}</div></div>`).join("")
                        : `<div class="c note">Aucune modification enregistrée pour l'instant.</div>`;
    }
    out += `<button class="chip" style="justify-content:center;padding:14px;font-size:15px;${this._dirty ? "" : "opacity:.5"}" data-a="adm" data-op="save"><ha-icon icon="mdi:content-save"></ha-icon>${FR.save}${this._dirty ? " (" + this._dirty.length + ")" : ""}</button>
      <div class="note">Version ${MD_VERSION}. Les réglages sont enregistrés dans la configuration de ce dashboard ; Home Assistant refuse l'enregistrement à un compte non administrateur.</div>`;
    return out;
  }
  async _loadUsers() {
    try {
      const u = await this._hass.callWS({ type: "config/auth/list" });
      this._users = u.filter((x) => !x.system_generated && x.is_active !== false);
    } catch (e) { this._users = []; this._usersErr = e?.code || String(e); }
    this._render(true);
  }
  _note(t) { (this._dirty = this._dirty || []).push(t); }
  async _admin(el) {
    const d = this._draft;
    if (!d) return;
    const op = el.dataset.op || el.dataset.adm, k = el.dataset.k, id = el.dataset.id;
    const toggleIn = (arr, x) => { const i = arr.indexOf(x); if (i === -1) arr.push(x); else arr.splice(i, 1); return arr; };
    if (op === "set") { d[k] = el.value || undefined; this._note(`${k} = ${el.value || "automatique"}`); this._render(true); return; }
    if (op === "room") { d.rooms = d.rooms || {}; d.rooms[id] = { ...(d.rooms[id] || {}), [el.dataset.f]: el.value || undefined }; this._note(`pièce ${id} : ${el.dataset.f}`); return; }
    if (op === "flag") { d[k] = !d[k]; this._note(`${k} = ${d[k] ? "oui" : "non"}`); }
    if (op === "list") { d[k] = toggleIn(d[k] || [], id); this._note(`${k} : ${id}`); }
    if (op === "up") {
      const ids = Object.values(this._hass.areas || {}).map((a) => a.area_id);
      const o = (d.room_order || []).filter((x) => ids.includes(x));
      for (const x of ids) if (!o.includes(x)) o.push(x);
      const i = o.indexOf(id); if (i > 0) { o.splice(i, 1); o.splice(i - 1, 0, id); }
      d.room_order = o; this._note(`ordre : ${id} monte`);
    }
    if (op === "user") { this._openUser = this._openUser === id ? null : id; }
    if (op === "ulist") {
      d.users = d.users || {}; const u = (d.users[el.dataset.u] = d.users[el.dataset.u] || {});
      u[k] = toggleIn(u[k] || [], id);
      const nom = (this._users || []).find((x) => x.id === el.dataset.u)?.name || el.dataset.u;
      this._note(`${nom} : ${k} ${id}`);
    }
    if (op === "save") return this._save();
    this._render(true);
  }
  async _save() {
    if (!this._dirty?.length) return;
    const h = this._hass, url = dashboardPath();
    try {
      const raw = await h.callWS({ type: "lovelace/config", url_path: url, force: true });
      const strat = { ...(raw.strategy || {}), ...this._draft, type: "custom:maison-dashboard" };
      const journal = (strat.journal || []).concat(this._dirty.map((q) => ({ quoi: q, qui: h.user?.name || "?", quand: new Date().toISOString() }))).slice(-60);
      strat.journal = journal;
      for (const k of Object.keys(strat)) if (strat[k] === undefined || strat[k] === "") delete strat[k];
      await h.callWS({ type: "lovelace/config/save", url_path: url, config: { ...raw, strategy: strat } });
      this._draft = JSON.parse(JSON.stringify(strat)); delete this._draft.type;
      this._dirty = null;
      this._toast(FR.saved + " — rechargement…");
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      this._toast(e?.code === "unauthorized" ? FR.not_admin : "Erreur : " + (e.message || e.code || e));
    }
  }
}
customElements.define("maison-page", MaisonPage);

console.info(`%c MAISON-DASHBOARD %c ${MD_VERSION} `, "background:#29b6f6;color:#001;font-weight:700", "background:#0a1222;color:#29b6f6");
