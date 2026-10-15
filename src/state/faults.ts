import type { Fault } from './faultsCore';

// Native: no fault code path. The web build swaps this file for faults.web.ts.
export type { Fault } from './faultsCore';
export const fault = (_name: Fault): boolean => false;
/** True while the injected fault is armed; the FAULT screen's RESET key disarms it. */
export const faultArmed = (_name: Fault): boolean => false;
export const clearFaults = (): void => {};
