import { content, type Manifest } from "@fo/content";
import { METER_MAX, TPS, type Compiled, type State } from "@fo/sim";
import { uiText, type Skin } from "@fo/skins";
import type { WorldView } from "@fo/render-2d";
import { goalText } from "./text.js";

// The HUD strip: level name, goal with progress, and resource chips in skin words. The model
// is a pure function of state so it is cheap to diff and easy to test.

export interface Chip { key: string; text: string; color: string; bad?: boolean; bar?: number }
export interface HudModel { goal: string; chips: Chip[] }

const COUNTS_AS_POP = new Set(["ok", "injured", "healing"]);

export function hudModel(state: State, m: Manifest, cp: Compiled | null, skin: Skin): HudModel {
  const w = state as unknown as WorldView;
  const pal = skin.palette;
  const chips: Chip[] = [];
  chips.push({ key: "currency", text: String(w.currency), color: pal.res["res.currency"] ?? "#ffcb3d" });

  const life = Math.max(0, Math.min(1, (w.meters?.lifeline ?? w.core.lifeline) / METER_MAX));
  chips.push({ key: "lifeline", text: skin.lifelineName, color: pal.accent, bar: life, bad: life < 0.35 || w.core.fuel <= 0 });

  const lv = cp?.core.levels[Math.min(Math.max(1, w.core.level), cp.core.levels.length) - 1];
  const cap = lv?.fuelCap ?? 0;
  chips.push({ key: "fuel", text: cap ? `${skin.fuelName} ${w.core.fuel}/${cap}` : `${skin.fuelName} ${w.core.fuel}`, color: pal.res["res.fuel_dense"] ?? pal.accent, bad: w.core.fuel <= 3 });

  const residents = w.residents ?? [];
  const housings = (w.structures ?? []).filter((s) => s.type === "struct.housing").length;
  const showPop = m.modules.includes("housing") || m.goal.type === "population" || housings > 0 || residents.some((r) => r.status === "waiting");
  const pop = residents.filter((r) => COUNTS_AS_POP.has(r.status ?? "ok")).length;
  if (showPop) {
    const base = m.params["housing.base"] ?? content.defaults["housing.base"] ?? 0;
    const per = m.params["housing.perBuilding"] ?? content.defaults["housing.perBuilding"] ?? 2;
    const slots = base + housings * per;
    chips.push({ key: "population", text: `${uiText(skin, "population")} ${pop}/${slots}`, color: pal.role["role.idle"] ?? "#b8c3cc", bad: pop >= slots && residents.some((r) => r.status === "waiting") });
  }

  const bhMax = w.meters?.baseHealthMax ?? 0;
  if (m.fail.includes("meter.base_health") || (m.modules.includes("defense") && bhMax > 0)) {
    const bh = w.meters?.baseHealth ?? 0;
    chips.push({ key: "baseHealth", text: `${uiText(skin, "baseHealth")} ${bh}`, color: pal.danger, bad: bhMax > 0 && bh / bhMax < 0.3 });
  }

  const waves = w.waves;
  if (waves && (waves.pending?.length || waves.active)) {
    const next = waves.pending?.[0];
    const hostiles = w.hostiles?.length ?? 0;
    if (waves.active && hostiles) chips.push({ key: "wave", text: `${uiText(skin, "wave")} ${waves.idx}: ${hostiles}`, color: pal.danger, bad: true });
    else if (next) chips.push({ key: "wave", text: `${uiText(skin, "wave")} ${Math.max(0, Math.ceil((next.tick - w.tick) / TPS))}s`, color: pal.structureDark });
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
  else if (g.type === "waves" && waves) goal += ` · ${waves.idx}/${waves.idx + (waves.pending?.length ? new Set(waves.pending.map((p) => p.tick)).size : 0)}`;
  return { goal, chips };
}

export function chipsHtml(model: HudModel): string {
  return model.chips.map((c) => {
    const cls = `chip${c.bad ? " bad" : ""}`;
    if (c.bar !== undefined) {
      const pct = Math.round(c.bar * 100);
      return `<span class="${cls} meter" data-k="${c.key}"><span class="lbl">${esc(c.text)}</span><span class="track"><span class="fill" style="width:${pct}%;background:${c.color}"></span></span></span>`;
    }
    return `<span class="${cls}" data-k="${c.key}"><span class="ic" style="background:${c.color}"></span>${esc(c.text)}</span>`;
  }).join("");
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
