import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getResponsiveMetrics, scaleStyleDefinitions } from '../theme';

export default function Card({ children, style }) {
  const { palette, shadows } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, shadows, metrics), [palette, shadows, metrics]);

  return <View style={[styles.card, style]}>{children}</View>;
}

function createStyles(palette, shadows, metrics) {
  return StyleSheet.create(scaleStyleDefinitions({
    card: {
      backgroundColor: palette.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.line,
      padding: 16,
      ...shadows.card,
    },
  }, metrics));
}
