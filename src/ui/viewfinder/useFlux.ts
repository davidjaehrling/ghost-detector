import { Magnetometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { mulberry32 } from '../boot/seed';
import { type FluxSample, createFluxWalk, sampleFromVector } from './flux';

export const SENSOR_MS = 100;
const TICK_MS = 100;

// The flux the viewfinder shows. Native: the device magnetometer at 10 Hz, converted to mG.
// Web, a device without the sensor, and ?static=1: the seeded walk (Bible section 3), so goldens
// and the browser harness stay deterministic. `active` false (blurred or backgrounded) stops both.
// Returns the sample and whether it comes from the sensor.
export function useFlux({ seed, isStatic, active }: { seed: number; isStatic: boolean; active: boolean }): { sample: FluxSample; fromSensor: boolean } {
  const [walk] = useState(() => createFluxWalk(seed));
  const [sample, setSample] = useState<FluxSample>(() => walk.next());
  const [fromSensor, setFromSensor] = useState(false);

  useEffect(() => {
    if (isStatic || !active || fromSensor) return;
    const id = setInterval(() => setSample(walk.next()), TICK_MS);
    return () => clearInterval(id);
  }, [isStatic, active, fromSensor, walk]);

  useEffect(() => {
    if (isStatic || !active || Platform.OS === 'web') return;
    let live = true;
    let sub: { remove(): void } | null = null;
    const jitter = mulberry32((seed ^ 0x6d61676e) >>> 0);
    Magnetometer.isAvailableAsync().then(
      (ok) => {
        if (!live || !ok) return;
        // Under 200 ms Android 12+ needs the HIGH_SAMPLING_RATE_SENSORS permission (app.json);
        // without it the platform caps the rate at 200 ms and the needle just updates less often.
        Magnetometer.setUpdateInterval(SENSOR_MS);
        sub = Magnetometer.addListener((v) => setSample(sampleFromVector(v, (jitter() - 0.5) * 2)));
        setFromSensor(true);
      },
      () => {},
    );
    return () => {
      live = false;
      sub?.remove();
      setFromSensor(false);
    };
  }, [isStatic, active, seed]);

  return { sample, fromSensor };
}
