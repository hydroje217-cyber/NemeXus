import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import ScreenShell from '../components/ScreenShell';
import { useTheme } from '../context/ThemeContext';

export default function LoadingScreen() {
  const { palette } = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <ScreenShell
      eyebrow="Loading"
      title="Preparing your workspace"
      subtitle="Checking session state and loading your profile."
      scroll={false}
    >
      <View style={styles.wrap}>
        <ActivityIndicator size="large" color={palette.teal600} />
        <Text style={styles.text}>Connecting to authentication and data services...</Text>
      </View>
    </ScreenShell>
  );
}

function createStyles(palette) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 14,
      paddingBottom: 80,
    },
    text: {
      color: palette.ink700,
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
