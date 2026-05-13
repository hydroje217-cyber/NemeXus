import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { getResponsiveMetrics, scaleStyleDefinitions } from '../theme';

export default function MessageBanner({ tone = 'info', children }) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(metrics), [metrics]);
  const tones = useMemo(
    () => ({
      info: {
        backgroundColor: isDark ? '#0C2132' : '#EAF6FF',
        borderColor: isDark ? '#1E5B70' : '#B8DDF0',
        color: isDark ? '#9BD5FF' : '#1D4E89',
        iconName: 'information-circle-outline',
      },
      success: {
        backgroundColor: palette.successBg,
        borderColor: isDark ? '#167C65' : '#9EDFD1',
        color: palette.successText,
        iconName: 'checkmark-circle-outline',
      },
      warning: {
        backgroundColor: palette.warningBg,
        borderColor: isDark ? '#8A6514' : '#F3C66B',
        color: palette.warningText,
        iconName: 'warning-outline',
      },
      error: {
        backgroundColor: palette.errorBg,
        borderColor: isDark ? '#803145' : '#F2A5B6',
        color: palette.errorText,
        iconName: 'alert-circle-outline',
      },
      secondary: {
        backgroundColor: isDark ? '#101D2A' : '#F8FCFF',
        borderColor: palette.line,
        color: palette.ink700,
        iconName: 'ellipse-outline',
      },
    }),
    [isDark, palette]
  );
  const appearance = tones[tone] || tones.info;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: appearance.backgroundColor,
          borderColor: appearance.borderColor,
        },
      ]}
    >
      <Ionicons name={appearance.iconName} size={16} color={appearance.color} style={styles.icon} />
      <Text style={[styles.text, { color: appearance.color }]}>{children}</Text>
    </View>
  );
}

function createStyles(metrics) {
  return StyleSheet.create(scaleStyleDefinitions({
    banner: {
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    icon: {
      marginTop: 1,
    },
    text: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
    },
  }, metrics));
}
