import { View } from 'react-native';
import { SkiaProbe } from '../src/fx/SkiaProbe';
import { color } from '../src/ui/tokens';

// Hidden L2 harness route (/probe?static=1): nothing links here. It proves Skia renders on web.
export default function Probe() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.n3 }}>
      <SkiaProbe />
    </View>
  );
}
