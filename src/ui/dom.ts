/** Tiny DOM helpers for the HTML overlays. */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function show(el: HTMLElement): void {
  el.hidden = false;
}

export function hide(el: HTMLElement): void {
  el.hidden = true;
}

/** Delegate clicks on `[data-action="name"]` descendants to a handler that receives the element. */
export function onAction(container: HTMLElement, handler: (action: string, el: HTMLElement) => void): void {
  container.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (el && container.contains(el)) handler(el.dataset.action!, el);
  });
}
