import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function Card({ children, style }) {
  const { palette, shadows } = useTheme();
  const styles = useMemo(() => createStyles(palette, shadows), [palette, shadows]);

  return <View style={[styles.card, style]}>{children}</View>;
}

function createStyles(palette, shadows) {
  return StyleSheet.create({
    card: {
      backgroundColor: palette.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.line,
      padding: 16,
      ...shadows.card,
    },
  });
}
