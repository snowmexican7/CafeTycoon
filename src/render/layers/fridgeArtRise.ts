import type { FridgeId } from '../../data/fridges';

/** ui-3.4.1: how tall each fridge stands above its spot (px), where its count and bubbles go. No Pixi (countsModel reads it). */
export const FRIDGE_RISE: Record<FridgeId, number> = { f1: 64, f2: 96, f3: 116, f4: 136 };
