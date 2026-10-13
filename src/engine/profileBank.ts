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
  'Guarded. Gives little away on the first sweep.',
  'Deliberate. Moves only when the room is still.',
  'Watchful. Tracks changes near the door.',
  'Unhurried. Takes its time to answer the sensor.',
  'Shy of bright rooms.',
  'Steady. Holds the same reading for long stretches.',
  'Easily unsettled by loud voices.',
  'Stubborn. Returns to the same spot after a disturbance.',
  'Reclusive. Avoids the busiest part of the house.',
  'Inquisitive. Lingers near anything recently moved.',
  'Subdued. Answers weakly, then more strongly.',
  'Cautious around new arrivals.',
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
  'Linked to a room that has changed use over the years.',
  'Stays near a threshold that is crossed often.',
  'Tied to the oldest staircase in the building.',
  'Associated with a cupboard or recess that is seldom opened.',
  'Drawn to the room furthest from the entrance.',
  'Holds close to a hearth or the place where one used to be.',
  'Attached to a spot beneath the roofline.',
  'Follows the path between two doors.',
  'Linked to a mirror, a frame or a similar fixed surface.',
  'Stays near the original floor level.',
  'Tied to a corridor that carries sound.',
  'Drawn to the point where the building was extended.',
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
  'Reading climbs slowly, then falls away at once.',
  'Strongest a few steps from the sensor.',
  'Disturbs the signal in a narrow band, then releases it.',
  'Fades when the sensor is held still.',
  'Returns to the same corner on each sweep.',
  'Raises the reading when the lights are low.',
  'Shows first as a drop in the field reading.',
  'Active for a few minutes, then silent for much longer.',
  'Tends to follow the sensor along the wall.',
  'Leaves a thin trace near doorways.',
  'Reading wavers at the edge of the frame.',
  'Stronger on the second sweep than the first.',
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
  'Activity rises in the hour before dawn.',
  'Stronger on still, windless nights.',
  'Quieter in the early evening.',
  'Peaks shortly after midnight.',
  'Activity follows the coldest hour.',
  'More active after rain.',
  'Little change between weekdays.',
  'Rises in the last light of the day.',
  'Stronger when the house has been empty for a while.',
  'Activity is steady through the small hours.',
  'Quieter in the warm months.',
  'Strongest in the hour after sunset.',
  'Activity dips when the heating comes on.',
  'Rises when the house settles for the night.',
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
