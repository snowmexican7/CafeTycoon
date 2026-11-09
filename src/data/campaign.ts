/**
 * Campaign start knobs, in one place. A pacing pass moves these numbers and leaves the shape alone.
 * Kennedy, 2026-11-09: about $40, the cheap Thrift Store pot (`d1`), and drip as the only drink.
 * The pot is placed on the cart. Its $15 price is not charged. Blitz does not read this file.
 */
import type { GearId } from './gear';

export const CAMPAIGN_START = {
  /** Till on the first night. About $40: a few bean packs and the cart's rent, not a Pod-o-Matic. */
  cash: 40,
  /** The Thrift Store Special, already on the floor. */
  pot: 'd1' as GearId,
  /** Same free bin a Gear run already gets, in the last slot. */
  bin: 'b0' as GearId,
  /**
   * A scoop of beans so day 1 can brew before anyone buys a pack.
   * One bean is one pot (4 cups on this machine). 8 beans is two packs' worth of cups, not a full day of stock.
   */
  beans: 8,
};
