/**
 * Gear Tree is the game since v3.0.0 (G11): every new run starts with the $120 fund and the Gear tab.
 * `?gear=0` is a hidden escape hatch that starts a classic (v2.2) run, for comparing and debugging only.
 * Old saves keep whatever mode they were started in.
 */
export function gearFlag(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('gear') !== '0';
}
