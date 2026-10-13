import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { useFonts } from 'expo-font';
import { Text, View } from 'react-native';

export default function BootScreen() {
  const [loaded] = useFonts({ VT323_400Regular });
  if (!loaded) return null;
  return (
    <View testID="boot-screen">
      <Text style={{ fontFamily: 'VT323_400Regular', fontSize: 24 }}>FIELD UNIT · BOOT</Text>
    </View>
  );
}
