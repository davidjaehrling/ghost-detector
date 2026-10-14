import * as Sharing from 'expo-sharing';

// Native: the system share sheet through expo-sharing. `shareAsync` takes a file URL and the
// chooser title only. It has no text parameter on Android or iOS, so the accompanying line cannot
// travel with the image; the card itself carries SIMULATED and the footer READINGS ARE SIMULATED.
export async function openShareSheet(card: { uri: string; fileName: string; format: 'story' | 'square' }, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing is not available');
  await Sharing.shareAsync(card.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
}
