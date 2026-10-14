// One serial rule for every screen (D-011). The nameplate is the serial's home: the full
// serial from 380 px up, the last 7 characters below. When the plate carries the short form,
// the calibration sticker prints the full serial, so the whole number is always on the unit.
export const SERIAL_SHORT_BELOW = 380;

export const isShortPlate = (windowW: number) => windowW < SERIAL_SHORT_BELOW;
export const plateSerial = (serial: string, windowW: number) => (isShortPlate(windowW) ? serial.slice(-7) : serial);
export const stickerShowsSerial = (windowW: number) => isShortPlate(windowW);
