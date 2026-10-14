import { type Fault, parseFaults } from './faultsCore';

// Web harness: `?fault=<name>[,<name>]`, read once at the first call because the router drops the
// query on a navigation (same latch as ?consent= and ?notify=). Production never sets it.
export type { Fault } from './faultsCore';

let active: ReadonlySet<Fault> | null = null;
const cleared = new Set<Fault>();

export function fault(name: Fault): boolean {
  active ??= parseFaults(typeof window !== 'undefined' ? (window.location?.search ?? '') : '');
  return active.has(name);
}

export const faultArmed = (name: Fault): boolean => fault(name) && !cleared.has(name);

export function clearFaults(): void {
  for (const f of active ?? []) cleared.add(f);
}
