/**
 * Word banks for the entity profile. EN only, field-manual voice (docs/voice-guide.md):
 * short sentences, high base-rate statements, no real people, deaths, illness or addresses,
 * no instructions to the user. No banned copy words.
 */

/** Class labels, ALL CAPS status words. 24 as in psych-brief 2.5. */
export const CLASSES = [
  'RESIDUAL', 'ECHO', 'LOOP', 'DRIFT', 'STATIC', 'THRESHOLD', 'DWELLER', 'WATCHER',
  'IMPRINT', 'SHADE', 'PRESENCE', 'FRAGMENT', 'TRACE-FORM', 'WANDERER', 'VESTIGE', 'SENTINEL',
  'MURMUR', 'AFTERIMAGE', 'LINGERER', 'CURRENT', 'SETTLER', 'HOLLOW', 'PASSAGE', 'KEEPER',
] as const;

/** Three-letter catalogue prefixes, index-matched to CLASSES. */
export const PREFIXES = [
  'RSD', 'ECH', 'LOP', 'DRF', 'STC', 'THR', 'DWL', 'WTC',
  'IMP', 'SHD', 'PRS', 'FRG', 'TRF', 'WND', 'VST', 'SNT',
  'MUR', 'AFT', 'LNG', 'CUR', 'STL', 'HLW', 'PSG', 'KPR',
] as const;

export const ERA_ANCHORS = [1780, 1800, 1820, 1840, 1860, 1880, 1900, 1920, 1940, 1960] as const;

export const TEMPERAMENT = [
  'Reserved. Keeps its distance.',
  'Restless. Does not hold one spot.',
  'Patient. Waits out interruptions.',
  'Wary of sudden noise.',
  'Curious about new objects in the room.',
  'Calm. Reacts to disturbance, not to presence.',
  'Withdrawn when the room is crowded.',
  'Habitual. Repeats its own routes.',
  'Quiet. Rarely raises the reading by itself.',
  'Responds to change in the room, not to people.',
  'Slow to settle after a disturbance.',
  'Indifferent to light. Stronger in shade.',
] as const;

export const ATTACHMENT = [
  'Attached to an object older than the current occupants.',
  'Drawn to the lowest room in the building.',
  'Linked to a doorway or a stairwell.',
  'Stays near the oldest wall.',
  'Tied to a spot where the floor changes level.',
  'Favours corners over open floor.',
  'Anchored to a window that is rarely opened.',
  'Keeps to the part of the building with the least traffic.',
  'Associated with a fixed piece of furniture.',
  'Holds close to a place that has not been altered.',
  'Drawn to the point where two rooms meet.',
  'Follows the line of an old route through the building.',
] as const;

export const BEHAVIOUR = [
  'Most active when the house is quiet.',
  'Disturbs readings for under a minute, then stops.',
  'Settles after dark.',
  'Reading drops when the room is entered, then recovers.',
  'Appears briefly, then fades below threshold.',
  'Moves along walls, not across the room.',
  'Shows as a cold spot before any other signal.',
  'Active in short bursts with long gaps.',
  'Tends to repeat the same reading on the next sweep.',
  'Strongest at the edge of the sensor range.',
  'Leaves a faint residue on the field reading.',
  'Reacts to a change in air movement.',
] as const;

export const TIMING = [
  'Activity rises after 22:00.',
  'Strongest between 02:00 and 04:00.',
  'Quieter at midday.',
  'Activity tracks the cold part of the night.',
  'Little change through the afternoon.',
  'More active on damp evenings.',
  'Rises at dusk. Falls before dawn.',
  'Peaks in the hour after the house goes still.',
  'Stronger in the colder months.',
  'No clear daily pattern.',
] as const;

/** Detail-line templates. {n} is a seeded number: a checkable-sounding code nobody can check. */
export const DETAIL = [
  'Signature ref C2-{n}.',
  'Band offset {n} Hz.',
  'Logged against case {n4}.',
  'Cold spot depth {dt} ΔT °C.',
  'Dominant bin {n} Hz.',
  'Drift {dt} ΔT °C per sweep.',
] as const;
