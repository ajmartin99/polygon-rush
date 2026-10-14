import { ICONS, type IconName } from './icons';

export type Child = Node | string | number | null | undefined | false | Child[];

type Props = {
  [key: string]: unknown;
  class?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  html?: string;
};

/**
 * Hyperscript helper: h('div.panel.row', { onclick }, 'text', child).
 * Tag may carry classes (`.a.b`) and an id (`#x`).
 */
export function h<T extends HTMLElement = HTMLElement>(tag: string, props?: Props | null, ...children: Child[]): T {
  const m = /^([a-z0-9-]+)?(#[\w-]+)?((?:\.[\w-]+)*)$/i.exec(tag);
  const el = document.createElement(m?.[1] || 'div') as T;
  if (m?.[2]) el.id = m[2].slice(1);
  if (m?.[3]) el.className = m[3].split('.').filter(Boolean).join(' ');
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') {
        el.className = `${el.className} ${String(value)}`.trim();
      } else if (key === 'style') {
        if (typeof value === 'string') el.setAttribute('style', value);
        else Object.assign(el.style, value);
      } else if (key === 'html') {
        el.innerHTML = String(value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key in el && typeof value !== 'string') {
        (el as unknown as Record<string, unknown>)[key] = value;
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else if (c instanceof Node) parent.appendChild(c);
    else parent.appendChild(document.createTextNode(String(c)));
  }
}

/** An inline icon as a DOM node. */
export function ic(name: IconName, cls = ''): HTMLElement {
  const span = document.createElement('span');
  span.className = `ic-wrap ${cls}`.trim();
  span.style.display = 'contents';
  span.innerHTML = ICONS[name];
  return span;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function fmt(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

/** Compact number: 12.3k */
export function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return fmt(n);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
