import "server-only";
import { prisma } from "@/lib/prisma";
import { GATE_DIRTY_KEY } from "./worker-state";

/**
 * The web app cannot talk to the panel itself — only the bridge may (the
 * panel accepts one TCP client). So instead of pushing a change, the app just
 * marks the mirror stale; the bridge notices on its next poll and reconciles
 * immediately rather than waiting for the periodic sync.
 *
 * The key itself lives in ./worker-state (no server-only), which the bridge
 * also imports — this file's server-only import must stay clear of anything
 * the bridge needs, or `tsx scripts/gate-bridge.ts` crashes on load.
 */

/** Call this from every action that changes who may enter — see
 *  docs/gate-hybrid-mode.md §4.3 for the full list of call sites. */
export async function markGateDirty(): Promise<void> {
  await prisma.setting
    .upsert({
      where: { key: GATE_DIRTY_KEY },
      update: { value: new Date().toISOString() },
      create: { key: GATE_DIRTY_KEY, value: new Date().toISOString() },
    })
    .catch(() => {
      // The door still works from whatever the panel last had; the only cost
      // of a failed write here is a slightly later reconcile.
    });
}
