// A loose, read-only view of sim state: the Phase-0 fields plus every Contract 1 field
// (docs/PLAN.md) as optional, so the renderer compiles and runs before and after the
// sim adds them. Draw code reads through this type, never through the sim State type.

export interface V { x: number; y: number }

export interface CustomerView { kind: string; res: string; want: number; patience: number; patienceMax: number; pos: V; angry?: boolean }

export interface ResidentView {
  id: number | string; pos: V; role: string; status: string;
  carry?: string | null; n?: number; mode?: string; target?: string | number | null;
}
export interface PadView { id: string; type: string; pos: V; done: boolean; paid: Record<string, number>; visible?: boolean; locked?: boolean }
export interface StructureView { id: string | number; type: string; pos: V; level?: number; hp?: number; hpMax?: number }
export interface SectionView { a: V; b: V; built: boolean; hp?: number; hpMax?: number; gate?: boolean }
export interface BarrierView { id: string | number; a: V; b: V; res?: string; costPerSection?: number; sections: SectionView[] }
export interface ZoneView { id: string | number; type: string; rect: { x: number; y: number; w: number; h: number }; cleared?: boolean }
export interface CaptureView { id: string | number; type: string; pos: V; state: string; timer?: number }
export interface PreyView { id: string | number; pos: V; hp?: number; alive: boolean; respawn?: number }
export interface HostileView { id: string | number; type: string; pos: V; hp?: number; hpMax?: number; target?: unknown }
export interface DropView { id: string | number; res: string; pos: V }
export interface ConverterView { id: string | number; type: string; pos: V; inQ: string[]; out: number; acc: number; operatorPos?: V; pickupPos?: V }
export interface SalesView {
  pos: V; register: V; pile: V; pileN: number; shelf: Record<string, number>; sells: string[];
  queue: CustomerView[]; leaving: CustomerView[];
}

export interface WorldView {
  tick: number;
  currency: number;
  player: { pos: V; face: number; stack: string[]; tow?: (string | number)[] };
  core: { pos: V; fuel: number; level: number; lifeline: number };
  nodes: { id: string | null; type: string; pos: V; stock: number | null; regrowAcc?: number; enabled: boolean }[];
  sales: SalesView | null;
  residents?: ResidentView[];
  pads?: PadView[];
  built?: string[];
  structures?: StructureView[];
  barriers?: BarrierView[];
  zones?: ZoneView[];
  preyZones?: { id: string | number; rect: { x: number; y: number; w: number; h: number }; animal?: string }[];
  captures?: CaptureView[];
  prey?: PreyView[];
  hostiles?: HostileView[];
  drops?: DropView[];
  converters?: ConverterView[];
  depot?: { pos: V; stock: Record<string, number> } | null;
  meters?: { lifeline?: number; baseHealth?: number; baseHealthMax?: number };
  waves?: { idx: number; pending?: { tick: number; type: string }[]; active?: boolean };
  hazard?: { phase: string; until?: number };
  lasso?: { trail?: V[]; towing?: (string | number)[]; engaged?: boolean };
  gateQueue?: number[];
  stats?: { sold?: number; rescued?: number };
  over: boolean;
  won: boolean | null;
  reason: string | null;
}
