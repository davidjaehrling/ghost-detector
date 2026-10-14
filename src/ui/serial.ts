// One serial rule for every screen (D-011). The nameplate is the serial's home and prints the full
// serial on every supported width (A-07: 360 sets the plate text at 0.4 tracking so 16 characters
// fit). Only a window under 340 px, which no supported phone has, falls back to the last 7
// characters; the calibration sticker then prints the full serial, so the whole number is always on the unit.
export const SERIAL_SHORT_BELOW = 340;

export const isShortPlate = (windowW: number) => windowW < SERIAL_SHORT_BELOW;
export const plateSerial = (serial: string, windowW: number) => (isShortPlate(windowW) ? serial.slice(-7) : serial);
export const stickerShowsSerial = (windowW: number) => isShortPlate(windowW);
