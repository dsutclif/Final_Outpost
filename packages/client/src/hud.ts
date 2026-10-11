import { content, type Manifest } from "@fo/content";
import { METER_MAX, TPS, type Compiled, type State } from "@fo/sim";
import { uiText, type Skin } from "@fo/skins";
import { goalText } from "./text.js";

// The HUD strip: level name, goal with progress, and resource chips in skin words. The model
// is a pure function of state so it is cheap to diff and easy to test.

export interface Chip {
  key: string; text: string; color: string; bad?: boolean;
  /** Meter fill 0..1 (draws a bar instead of an icon). */
  bar?: number;
  /** Tick marks on the bar, 0..1 (the 25% heat line). */
  ticks?: number[];
}
/** One live objective (star) with its counter, when the sim reports objectives. */
export interface ObjectiveLine { id: string; text: string; done: boolean; failed: boolean }
export interface HudModel { goal: string; chips: Chip[]; objectives: ObjectiveLine[] }

/** Optional sim fields from engine 0.5 (freeze countdown, objectives); read only when present. */
interface Freeze { active: boolean; ticksLeft: number; ticksTotal: number }
interface SimObjective { id: string; kind: string; progress: number; target: number; done: boolean; failed: boolean }
interface ManifestObjective { id?: string; kind: string; label?: string }

const clock = (ticks: number): string => { const s = Math.max(0, Math.ceil(ticks / TPS)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

const COUNTS_AS_POP = new Set(["ok", "injured", "healing"]);

export function hudModel(state: State, m: Manifest, cp: Compiled | null, skin: Skin): HudModel {
  const w = state;
  const pal = skin.palette;
  const ext = state as unknown as { freeze?: Freeze; objectives?: SimObjective[] };
  const chips: Chip[] = [];
  chips.push({ key: "currency", text: String(w.currency), color: pal.res["res.currency"] ?? "#ffcb3d" });

  const life = Math.max(0, Math.min(1, (w.meters?.lifeline ?? w.core.lifeline) / METER_MAX));
  const fz = ext.freeze;
  if (fz?.active) chips.push({ key: "lifeline", text: uiText(skin, "freezesIn", { t: clock(fz.ticksLeft) }), color: pal.interactive, bar: Math.max(0, Math.min(1, fz.ticksLeft / Math.max(1, fz.ticksTotal))), bad: true });
  else chips.push({ key: "lifeline", text: skin.lifelineName, color: pal.accent, bar: life, bad: life < 0.35 || w.core.fuel <= 0, ticks: [0.25] });

  const lv = cp?.core.levels[Math.min(Math.max(1, w.core.level), cp.core.levels.length) - 1];
  const cap = lv?.fuelCap ?? 0;
  chips.push({ key: "fuel", text: cap ? `${w.core.fuel}/${cap}` : `${w.core.fuel}`, color: pal.res["res.fuel_dense"] ?? pal.accent, bad: w.core.fuel <= 3 });

  const residents = w.residents ?? [];
  const housings = (w.structures ?? []).filter((s) => s.type === "struct.housing").length;
  const showPop = m.modules.includes("housing") || m.goal.type === "population" || housings > 0 || residents.some((r) => r.status === "waiting");
  const pop = residents.filter((r) => COUNTS_AS_POP.has(r.status ?? "ok")).length;
  if (showPop) {
    const base = m.params["housing.base"] ?? content.defaults["housing.base"] ?? 0;
    const per = m.params["housing.perBuilding"] ?? content.defaults["housing.perBuilding"] ?? 2;
    const slots = base + housings * per;
    chips.push({ key: "population", text: `${pop}/${slots}`, color: pal.role["role.idle"] ?? "#b8c3cc", bad: pop >= slots && residents.some((r) => r.status === "waiting") });
  }

  const bhMax = w.meters?.baseHealthMax ?? 0;
  if (m.fail.includes("meter.base_health") || (m.modules.includes("defense") && bhMax > 0)) {
    const bh = w.meters?.baseHealth ?? 0;
    const k = bhMax > 0 ? Math.max(0, Math.min(1, bh / bhMax)) : 1;
    chips.push({ key: "baseHealth", text: `${uiText(skin, "baseHealth")} ${Math.max(0, bh)}/${bhMax}`, color: pal.danger, bar: k, bad: k < 0.3 });
  }

  const waves = w.waves;
  const totalWaves = cp?.waves.length ?? 0;
  if (waves && totalWaves > 0) {
    const hostiles = w.hostiles?.length ?? 0;
    const next = cp?.waves[waves.idx];
    if (waves.active && (hostiles || waves.pending?.length)) chips.push({ key: "wave", text: `${uiText(skin, "wave")} ${waves.idx}/${totalWaves} · ${hostiles + (waves.pending?.length ?? 0)}`, color: pal.danger, bad: true });
    else if (next) {
      const s = Math.max(0, Math.ceil((next.tick - w.tick) / TPS));
      chips.push({ key: "wave", text: `${uiText(skin, "wave")} ${waves.idx + 1} · ${s}s`, color: pal.structureDark, bad: s <= 10 });
    }
  }

  if (cp && cp.timerTicks > 0) {
    const left = Math.max(0, Math.ceil((cp.timerTicks - w.tick) / TPS));
    chips.push({ key: "timer", text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, color: pal.interactive, bad: left < 20 });
  }

  let goal = goalText(m, skin);
  const g = m.goal;
  if (g.type === "population") goal += ` · ${pop}/${g.n}`;
  else if (g.type === "currency") goal += ` · ${w.currency}/${g.n}`;
  else if (g.type === "serve_premium") goal += ` · ${(state.sales?.premiumServed ?? 0)}/${g.n}`;
  else if (g.type === "waves" && waves) goal += ` · ${Math.max(0, waves.idx - (waves.active ? 1 : 0))}/${totalWaves}`;
  return { goal, chips, objectives: objectiveLines(ext.objectives, m, skin) };
}

/** The live objective strip ("VIPs 2/5 ✓"), from state.objectives and the manifest's labels. */
export function objectiveLines(list: SimObjective[] | undefined, m: Manifest, skin: Skin): ObjectiveLine[] {
  if (!Array.isArray(list) || !list.length) return [];
  const defs = ((m as unknown as { objectives?: ManifestObjective[] }).objectives ?? []);
  return list.map((o, i) => {
    const def = defs.find((d) => d.id !== undefined && d.id === o.id) ?? defs[i];
    const label = def?.label ?? skin.text.ui[`obj_${o.kind}`] ?? uiText(skin, o.kind);
    const count = o.target > 1 ? ` ${Math.min(o.progress, o.target)}/${o.target}` : "";
    return { id: o.id, text: `${label}${count}`, done: o.done, failed: o.failed };
  });
}

export function chipsHtml(model: HudModel): string {
  return model.chips.map((c) => {
    const cls = `chip${c.bad ? " bad" : ""}`;
    if (c.bar !== undefined) {
      const pct = Math.round(c.bar * 100);
      const ticks = (c.ticks ?? []).map((t) => `<span class="tick" style="left:${Math.round(t * 100)}%"></span>`).join("");
      return `<span class="${cls} meter" data-k="${c.key}"><span class="lbl">${esc(c.text)}</span><span class="track"><span class="fill" style="width:${pct}%;background:${c.color}"></span>${ticks}</span></span>`;
    }
    return `<span class="${cls}" data-k="${c.key}"><span class="ic" style="background:${c.color}"></span>${esc(c.text)}</span>`;
  }).join("");
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

interface ChipEls { root: HTMLElement; lbl: HTMLElement; fill: HTMLElement | null; ic: HTMLElement | null; key: string; ticks: string }

/**
 * Keeps one DOM node per chip and patches text and widths in place, so CSS transitions and the
 * coin-landing pulse survive updates. The currency number counts toward its real value.
 */
export class HudView {
  private els = new Map<string, ChipEls>();
  private shown = 0;
  private target = 0;
  private first = true;

  constructor(private readonly root: HTMLElement) {}

  reset(currency: number): void {
    this.root.textContent = "";
    this.els.clear();
    this.shown = currency;
    this.target = currency;
    this.first = true;
  }

  render(model: HudModel): void {
    const doc = this.root.ownerDocument;
    const seen = new Set<string>();
    model.chips.forEach((c, i) => {
      seen.add(c.key);
      let el = this.els.get(c.key);
      const meter = c.bar !== undefined;
      if (!el || (el.fill !== null) !== meter) {
        el?.root.remove();
        const root = doc.createElement("span");
        root.dataset["k"] = c.key;
        const lbl = doc.createElement("span");
        lbl.className = "lbl";
        let fill: HTMLElement | null = null, ic: HTMLElement | null = null;
        if (meter) {
          root.appendChild(lbl);
          const track = doc.createElement("span");
          track.className = "track";
          fill = doc.createElement("span");
          fill.className = "fill";
          track.appendChild(fill);
          root.appendChild(track);
        } else {
          ic = doc.createElement("span");
          ic.className = "ic";
          root.appendChild(ic);
          root.appendChild(lbl);
        }
        el = { root, lbl, fill, ic, key: c.key, ticks: "" };
        this.els.set(c.key, el);
      }
      const tk = (c.ticks ?? []).join(",");
      if (el.fill && el.ticks !== tk) {
        el.ticks = tk;
        const track = el.fill.parentElement!;
        for (const t of track.querySelectorAll(".tick")) t.remove();
        for (const t of c.ticks ?? []) { const m = doc.createElement("span"); m.className = "tick"; m.style.left = `${Math.round(t * 100)}%`; track.appendChild(m); }
      }
      const keep = ["pulse", "hit"].filter((k) => el!.root.classList.contains(k)).map((k) => ` ${k}`).join("");
      const cls = `chip${c.bad ? " bad" : ""}${meter ? " meter" : ""}${keep}`;
      if (el.root.className !== cls) el.root.className = cls;
      if (c.key === "currency") {
        this.target = Number(c.text) || 0;
        if (this.first) { this.shown = this.target; this.first = false; }
      } else if (el.lbl.textContent !== c.text) el.lbl.textContent = c.text;
      if (el.fill) { const wPct = `${Math.round((c.bar ?? 0) * 100)}%`; if (el.fill.style.width !== wPct) el.fill.style.width = wPct; if (el.fill.style.background !== c.color) el.fill.style.background = c.color; }
      if (el.ic && el.ic.dataset["c"] !== c.color) { el.ic.style.background = c.color; el.ic.dataset["c"] = c.color; }
      if (this.root.children[i] !== el.root) this.root.insertBefore(el.root, this.root.children[i] ?? null);
    });
    for (const [k, el] of this.els) if (!seen.has(k)) { el.root.remove(); this.els.delete(k); }
    this.paintCurrency();
  }

  /** Per frame: count the currency chip toward its real value. */
  tick(dtSec: number): void {
    if (this.shown === this.target) return;
    const diff = this.target - this.shown;
    const step = Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dtSec * 9)));
    this.shown += Math.sign(diff) * Math.min(Math.abs(diff), step);
    this.paintCurrency();
  }

  private paintCurrency(): void {
    const el = this.els.get("currency");
    if (!el) return;
    const s = String(this.shown);
    if (el.lbl.textContent !== s) el.lbl.textContent = s;
  }

  /** Damage feedback on a meter chip: red flash and a shake (Colony HP on base hits). */
  hit(key: string): void {
    const el = this.els.get(key)?.root;
    if (!el) return;
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
    const t = this.hitTimers.get(key);
    if (t) clearTimeout(t);
    this.hitTimers.set(key, setTimeout(() => el.classList.remove("hit"), 450));
  }
  private hitTimers = new Map<string, ReturnType<typeof setTimeout>>();

  pulse(key: string): void {
    const el = this.els.get(key)?.root;
    if (!el) return;
    el.classList.remove("pulse");
    void el.offsetWidth;
    el.classList.add("pulse");
  }

  anchor(key: string): HTMLElement | null { return this.els.get(key)?.root ?? null; }
}
