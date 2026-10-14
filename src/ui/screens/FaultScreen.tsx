import { useEffect } from 'react';
import { Platform } from 'react-native';
import { ensureConsent } from '../../ads';
import { track } from '../../analytics';
import { copyOf, useLocale } from '../../i18n';
import { clearFaults } from '../../state/faults';
import { Placeholder } from './Placeholder';

const copy = copyOf({
  unitCode: 'fault.unit.code',
  unitCause: 'fault.unit.cause',
  opticsCode: 'fault.optics.code',
  opticsCause: 'fault.optics.cause',
  next: 'fault.next',
  reset: 'fault.reset',
  resetLabel: 'fault.resetLabel',
});

export type FaultKind = 'unit' | 'optics';
const CODE = { unit: 'E-60', optics: 'E-52' } as const;

// The in-fiction crash screen: housing, phosphor, a code, the cause, one RESET key. It draws no
// Skia, so it can stand in when the glass stack is what failed. The analytics event carries the
// code and nothing else.
export function FaultScreen({ kind, onReset }: { kind: FaultKind; onReset: () => void }) {
  useLocale();
  useEffect(() => {
    // The facade drops events until the consent check has resolved, so wait for it.
    void ensureConsent().then(() => track('fault', { code: CODE[kind] }));
  }, [kind]);
  const code = kind === 'unit' ? copy.unitCode : copy.opticsCode;
  const cause = kind === 'unit' ? copy.unitCause : copy.opticsCause;
  return (
    <Placeholder
      testID="screen-fault"
      code={code}
      sub={cause}
      readout={copy.next}
      graticule={false}
      keys={[{ testID: 'key-reset', label: copy.resetLabel, legend: copy.reset, onPress: onReset, primary: true }]}
    />
  );
}

/** Route-level boundary (expo-router passes `error` and `retry`): RESET remounts the route. */
export function RouteFault({ retry }: { error: Error; retry: () => Promise<unknown> | void }) {
  return (
    <FaultScreen
      kind="unit"
      onReset={() => {
        clearFaults();
        void retry();
      }}
    />
  );
}

/** Web reload for the optics fault: CanvasKit is only retried by a fresh page. */
export function reloadPage(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
}
