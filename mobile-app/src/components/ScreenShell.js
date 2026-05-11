import { createContext, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Platform, findNodeHandle, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { getResponsiveMetrics, scaleStyleDefinitions } from '../theme';

export const KeyboardScrollContext = createContext({
  scrollToField: () => {},
});

export default function ScreenShell({
  eyebrow,
  title,
  subtitle,
  children,
  scroll = true,
  keyboardAware = false,
  keyboardAwareProps,
}) {
  const { palette, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, metrics), [palette, isDark, metrics]);
  const keyboardScrollRef = useRef(null);

  const keyboardController = useMemo(
    () => ({
      scrollToField(target, extraHeight = 120) {
        if (!keyboardAware || !target) {
          return;
        }

        const nodeHandle = typeof target === 'number' ? target : findNodeHandle(target);
        if (!nodeHandle) {
          return;
        }

        const scrollApi =
          keyboardScrollRef.current?.props?.scrollToFocusedInput ||
          keyboardScrollRef.current?.scrollToFocusedInput;

        if (typeof scrollApi === 'function') {
          scrollApi(nodeHandle, extraHeight, 0);
        }
      },
    }),
    [keyboardAware]
  );

  const content = (
    <KeyboardScrollContext.Provider value={keyboardController}>
      <View style={styles.body}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <PressableThemeToggle
              isDark={isDark}
              palette={palette}
              onPress={toggleTheme}
              styles={styles}
            />
          </View>
        </View>
        <View style={styles.content}>{children}</View>
      </View>
    </KeyboardScrollContext.Provider>
  );

  if (!scroll) {
    return <View style={styles.container}>{content}</View>;
  }

  if (keyboardAware && Platform.OS !== 'web') {
    return (
      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={72}
        extraHeight={96}
        keyboardOpeningTime={0}
        innerRef={(ref) => {
          keyboardScrollRef.current = ref;
          keyboardAwareProps?.innerRef?.(ref);
        }}
        {...keyboardAwareProps}
      >
        {content}
      </KeyboardAwareScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {content}
    </ScrollView>
  );
}

function PressableThemeToggle({ isDark, palette, onPress, styles }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.themeToggle, pressed && styles.themeTogglePressed]}
    >
      <View style={styles.themeToggleContent}>
        <Ionicons
          name={isDark ? 'sunny-outline' : 'moon-outline'}
          size={14}
          color={palette.onAccent}
        />
        <Text style={styles.themeToggleText}>{isDark ? 'Light' : 'Dark'}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(palette, isDark, metrics) {
  return StyleSheet.create(scaleStyleDefinitions({
    container: {
      flex: 1,
      backgroundColor: palette.canvas,
    },
    scrollContent: {
      flexGrow: 1,
    },
    body: {
      flex: 1,
      width: '100%',
      maxWidth: metrics.contentMaxWidth,
      alignSelf: 'center',
    },
    hero: {
      paddingTop: 10,
      paddingHorizontal: metrics.contentPadding,
      paddingBottom: 14,
      backgroundColor: palette.navy900,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.08)',
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    heroCopy: {
      flex: 1,
    },
    eyebrow: {
      color: palette.cyan300,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    title: {
      color: palette.onAccent,
      fontSize: 22,
      fontWeight: '800',
    },
    subtitle: {
      marginTop: 6,
      color: palette.heroSubtitle,
      fontSize: 13,
      lineHeight: 18,
    },
    themeToggle: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.14)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: 72,
    },
    themeTogglePressed: {
      transform: [{ scale: 0.98 }],
    },
    themeToggleContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    themeToggleText: {
      color: palette.onAccent,
      fontSize: 11,
      fontWeight: '700',
    },
    content: {
      padding: metrics.contentPadding,
      gap: metrics.contentGap,
    },
  }, metrics, {
    exclude: ['body.width', 'body.maxWidth', 'body.alignSelf', 'content.padding', 'content.gap', 'hero.paddingHorizontal'],
  }));
}
