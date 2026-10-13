// Pure half of the shared Readout row: the padded, fixed-width fields.

export type FieldSpec = { label: string; value: string; unit?: string; status?: string; labelCh?: number; valueCh?: number; unitCh?: number };

const NBSP = '\u00A0';

export function composeFields(p: FieldSpec): string[] {
  const { label, value, unit = '', status, labelCh = 6, valueCh = 5, unitCh = 4 } = p;
  const fields = [label.padEnd(labelCh), ' ', value.padStart(valueCh), ' ', unit.padEnd(unitCh)];
  if (status) fields.push(' ', status);
  // Non-breaking spaces: nested Text collapses plain runs of spaces on web.
  return fields.map((f) => f.replace(/ /g, NBSP));
}

