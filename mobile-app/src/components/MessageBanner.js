import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getResponsiveMetrics, scaleStyleDefinitions } from '../theme';

export default function MessageBanner({ tone = 'info', children }) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(metrics), [metrics]);
  const tones = useMemo(
    () => ({
      info: {
        backgroundColor: palette.warningBg,
        color: palette.warningText,
      },
      success: {
        backgroundColor: palette.successBg,
        color: palette.successText,
      },
      error: {
        backgroundColor: palette.errorBg,
        color: palette.errorText,
      },
    }),
    [palette]
  );
  const appearance = tones[tone] || tones.info;

  return (
    <View style={[styles.banner, { backgroundColor: appearance.backgroundColor }]}>
      <Text style={[styles.text, { color: appearance.color }]}>{children}</Text>
    </View>
  );
}

function createStyles(metrics) {
  return StyleSheet.create(scaleStyleDefinitions({
    banner: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    text: {
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
    },
  }, metrics));
}
