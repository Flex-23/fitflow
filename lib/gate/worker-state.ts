/**
 * Setting keys the gate bridge on the gym computer writes and the hosted app
 * reads. Kept in their own module because both sides import them and the
 * bridge must not pull in anything server-only from Next.js.
 */

/** ISO timestamp the bridge refreshes while it is running. */
export const GATE_HEARTBEAT_KEY = "gate.heartbeat";
/** ISO timestamp of the last moment the panel answered. Empty when never. */
export const GATE_PANEL_OK_KEY = "gate.panelOkAt";
/** How many members the last reconcile left synced onto the panel's own
 *  memory (hybrid mode — docs/gate-hybrid-mode.md). Empty before the first. */
export const GATE_PANEL_USERS_KEY = "gate.panelUsers";
/** Set by the manager's "تفريغ ذاكرة اللوحة" button; the bridge deletes every
 *  row on the panel, then reconciles fresh, then clears this itself. */
export const GATE_WIPE_REQUESTED_KEY = "gate.wipeRequested";
/**
 * Set by the web app (see lib/gate/dirty.ts) from every action that changes
 * who may enter. The bridge reads it every poll cycle and reconciles the
 * moment it is newer than the last reconcile, instead of waiting for the
 * periodic sync.
 */
export const GATE_DIRTY_KEY = "gate.dirtyAt";

/** How long after its last heartbeat the bridge counts as stopped. */
export const GATE_STALE_MS = 60_000;

export type GateHealth = {
  /** The bridge process on the gym computer is running. */
  bridgeUp: boolean;
  /** The bridge is talking to the turnstile panel. */
  panelUp: boolean;
  lastSeen: string | null;
  panelOkAt: string | null;
};

/**
 * Read the two timestamps as a state.
 *
 * A gate that is unplugged is not a broken gym: everything else carries on,
 * and this only exists so the desk is told which of the two is true instead
 * of watching a page that looks fine and wondering why nobody gets in.
 */
export function gateHealth(
  heartbeat: string,
  panelOkAt: string,
  now = Date.now()
): GateHealth {
  const seen = heartbeat ? Date.parse(heartbeat) : NaN;
  const ok = panelOkAt ? Date.parse(panelOkAt) : NaN;

  return {
    bridgeUp: Number.isFinite(seen) && now - seen < GATE_STALE_MS,
    panelUp: Number.isFinite(ok) && now - ok < GATE_STALE_MS,
    lastSeen: heartbeat || null,
    panelOkAt: panelOkAt || null,
  };
}
