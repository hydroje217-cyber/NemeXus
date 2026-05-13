import { createContext, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Platform, findNodeHandle, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getResponsiveMetrics, scaleStyleDefinitions } from '../theme';
import { StatusPill } from './UiControls';

export const KeyboardScrollContext = createContext({
  scrollToField: () => {},
});

export default function ScreenShell({
  eyebrow,
  title,
  subtitle,
  statusChips = [],
  showMenuButton = false,
  hideThemeToggle = false,
  children,
  scroll = true,
  keyboardAware = false,
  keyboardAwareProps,
  refreshing = false,
  onRefresh,
}) {
  const { profile, signOut } = useAuth();
  const { palette, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, metrics), [palette, isDark, metrics]);
  const keyboardScrollRef = useRef(null);
  const [accountOpen, setAccountOpen] = useState(false);

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

  const renderStatusChips = (style) =>
    statusChips.length ? (
      <View style={[styles.statusChipRow, style]}>
        {statusChips.map((chip) => (
          <StatusPill
            key={chip.key || chip.label}
            label={chip.label}
            iconName={chip.iconName}
            iconColor={chip.iconColor}
            tone={chip.tone}
          />
        ))}
      </View>
    ) : null;
  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={palette.teal600}
      colors={[palette.teal600]}
      progressBackgroundColor={palette.card}
    />
  ) : undefined;

  const content = (
    <KeyboardScrollContext.Provider value={keyboardController}>
      <View style={styles.body}>
        {accountOpen ? (
          <Pressable
            accessibilityLabel="Close account details"
            onPress={() => setAccountOpen(false)}
            style={styles.accountDismissLayer}
          />
        ) : null}
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIdentityGroup}>
              <View style={styles.heroCopy}>
                {eyebrow ? <Text numberOfLines={1} style={styles.eyebrow}>{eyebrow}</Text> : null}
                <Text numberOfLines={1} style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
            </View>
            {renderStatusChips(styles.statusChipRowHeader)}
            {showMenuButton ? (
              <View style={styles.accountControlWrap}>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation?.();
                    setAccountOpen((current) => !current);
                  }}
                  accessibilityLabel={accountOpen ? 'Close account details' : 'Open account details'}
                  style={({ pressed }) => [styles.accountIconButton, accountOpen && styles.accountIconButtonOpen, pressed && styles.menuButtonPressed]}
                >
                  <Ionicons name="person-outline" size={16} color={palette.cyan300} />
                </Pressable>
                {accountOpen ? (
                  <View
                    style={styles.accountDropdown}
                    onStartShouldSetResponder={() => true}
                  >
                    <View style={styles.accountMenuTop}>
                      <View style={styles.accountAvatar}>
                        <Ionicons name="person-outline" size={16} color={palette.cyan300} />
                      </View>
                      <View style={styles.accountCopy}>
                        <Text style={styles.accountEyebrow}>Office account</Text>
                        <Text numberOfLines={1} style={styles.accountName}>{profile?.full_name || profile?.email || 'Office user'}</Text>
                        <Text numberOfLines={1} style={styles.accountEmail}>{profile?.email || '-'}</Text>
                      </View>
                    </View>
                    <View style={styles.accountMenuBottom}>
                      <View style={styles.accountRolePill}>
                        <Text style={styles.accountRoleText}>{profile?.role || 'user'}</Text>
                      </View>
                    </View>
                    {!hideThemeToggle ? (
                      <PressableThemeToggle
                        isDark={isDark}
                        palette={palette}
                        onPress={toggleTheme}
                        styles={styles}
                        menuItem
                      />
                    ) : null}
                      <Pressable onPress={signOut} style={({ pressed }) => [styles.accountSignOut, pressed && styles.menuButtonPressed]}>
                        <Ionicons name="log-out-outline" size={13} color={palette.amber500} />
                        <Text style={styles.accountSignOutText}>Sign out</Text>
                      </Pressable>
                  </View>
                ) : null}
              </View>
            ) : !hideThemeToggle ? (
              <PressableThemeToggle
                isDark={isDark}
                palette={palette}
                onPress={toggleTheme}
                styles={styles}
              />
            ) : null}
          </View>
          {renderStatusChips(styles.statusChipRowBelow)}
        </View>
        <Pressable
          disabled={!accountOpen}
          onPress={() => setAccountOpen(false)}
          style={styles.contentDismissWrap}
        >
          <View style={styles.content}>{children}</View>
        </Pressable>
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
        refreshControl={refreshControl}
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
      refreshControl={refreshControl}
    >
      {content}
    </ScrollView>
  );
}

function PressableThemeToggle({ isDark, palette, onPress, styles, menuItem = false }) {
  const iconColor = menuItem ? palette.ink900 : palette.onAccent;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.themeToggle,
        menuItem && styles.themeToggleMenuItem,
        pressed && styles.themeTogglePressed,
      ]}
    >
      <View style={styles.themeToggleContent}>
        <Ionicons
          name={isDark ? 'sunny-outline' : 'moon-outline'}
          size={14}
          color={iconColor}
        />
        <Text style={[styles.themeToggleText, menuItem && styles.themeToggleTextMenuItem]}>
          {isDark ? 'Light' : 'Dark'}
        </Text>
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
      zIndex: 300,
      elevation: 300,
    },
    accountDismissLayer: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 250,
      elevation: 250,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: metrics.isTablet ? 10 : 12,
    },
    heroIdentityGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
      maxWidth: metrics.isTablet ? 270 : undefined,
    },
    menuButtonPressed: {
      transform: [{ scale: 0.98 }],
    },
    heroCopy: {
      flexShrink: 1,
      minWidth: 0,
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
    statusChipRow: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      gap: 4,
    },
    statusChipRowHeader: {
      display: metrics.isTablet ? 'flex' : 'none',
      flexShrink: 0,
      justifyContent: 'flex-end',
      marginLeft: 'auto',
      marginRight: 2,
    },
    statusChipRowBelow: {
      display: metrics.isTablet ? 'none' : 'flex',
      justifyContent: 'center',
      alignSelf: 'center',
      marginTop: 10,
    },
    accountControlWrap: {
      position: 'relative',
      zIndex: 360,
      elevation: 360,
    },
    accountIconButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#294C68' : 'rgba(191,212,231,0.8)',
      backgroundColor: isDark ? '#0C1824' : 'rgba(248,252,255,0.08)',
      borderRadius: 10,
    },
    accountIconButtonOpen: {
      borderColor: palette.cyan300,
      backgroundColor: isDark ? '#12384C' : 'rgba(103,232,249,0.12)',
    },
    accountDropdown: {
      position: 'absolute',
      top: 48,
      right: 0,
      width: metrics.isTablet ? 330 : 292,
      borderWidth: 1,
      borderColor: isDark ? '#2B5877' : 'rgba(191,212,231,0.92)',
      backgroundColor: isDark ? '#0B1724' : '#F8FCFF',
      padding: 12,
      borderRadius: 12,
      gap: 12,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.24 : 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 380,
      zIndex: 380,
    },
    accountMenuTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    accountAvatar: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#1E5B70' : '#B8DDF0',
      backgroundColor: isDark ? '#102A3A' : '#EAF8FF',
      borderRadius: 8,
    },
    accountCopy: {
      flex: 1,
      minWidth: 0,
    },
    accountEyebrow: {
      color: palette.ink500,
      fontSize: 9,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    accountName: {
      marginTop: 2,
      color: palette.ink900,
      fontSize: 13,
      fontWeight: '900',
    },
    accountEmail: {
      marginTop: 1,
      color: palette.ink500,
      fontSize: 10,
      fontWeight: '700',
    },
    accountMenuBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 8,
    },
    accountRolePill: {
      borderWidth: 1,
      borderColor: isDark ? '#1D8C91' : '#8ADCD6',
      backgroundColor: isDark ? '#0F3A35' : '#E5F8F6',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },
    accountRoleText: {
      color: palette.ink900,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    accountSignOut: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: isDark ? '#8A6514' : '#F7D6A7',
      backgroundColor: isDark ? '#33240B' : '#FFF5E8',
      paddingHorizontal: 9,
      paddingVertical: 5,
      minHeight: 36,
      borderRadius: 10,
    },
    accountSignOutText: {
      color: isDark ? '#F7CA72' : '#9A6700',
      fontSize: 10,
      fontWeight: '900',
    },
    themeToggle: {
      height: 32,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.14)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 0,
      minWidth: 72,
      alignItems: 'center',
      justifyContent: 'center',
    },
    themeToggleMenuItem: {
      height: 36,
      width: '100%',
      borderColor: isDark ? '#1D8C91' : '#8ADCD6',
      backgroundColor: isDark ? '#0F3A35' : '#E5F8F6',
      borderRadius: 10,
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
    themeToggleTextMenuItem: {
      color: palette.ink900,
      fontWeight: '900',
    },
    content: {
      padding: metrics.contentPadding,
      gap: metrics.contentGap,
    },
    contentDismissWrap: {
      flex: 1,
    },
  }, metrics, {
    exclude: ['body.width', 'body.maxWidth', 'body.alignSelf', 'content.padding', 'content.gap', 'hero.paddingHorizontal', 'contentDismissWrap.flex'],
  }));
}
