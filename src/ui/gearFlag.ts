/** Gear Tree (in progress): the hidden `?gear=1` URL flag. Off by default; new runs stay classic without it. */
export function gearFlag(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('gear') === '1';
}
