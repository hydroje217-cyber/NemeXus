import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { getResponsiveMetrics, scaleStyleDefinitions } from '../theme';

const CONTROL_HEIGHTS = {
  compact: 36,
  field: 44,
  action: 52,
};

const EXPORT_OPTIONS = [
  { key: 'csv', label: '.csv', iconName: 'document-text-outline' },
  { key: 'xlsx', label: '.xlsx', iconName: 'grid-outline' },
  { key: 'pdf', label: '.pdf', iconName: 'document-attach-outline' },
];

export function ControlButton({
  label,
  iconName,
  onPress,
  disabled = false,
  loading = false,
  tone = 'neutral',
  size = 'compact',
  iconOnly = false,
  style,
  textStyle,
}) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, metrics), [palette, isDark, metrics]);
  const heightStyle = getHeightStyle(size);
  const iconColor = getToneColor(tone, palette, isDark);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.controlButton,
        heightStyle,
        styles[`controlButton_${tone}`] || styles.controlButton_neutral,
        iconOnly && styles.controlButtonIconOnly,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading ? styles.pressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <>
          {iconName ? <Ionicons name={iconName} size={13} color={iconColor} /> : null}
          {!iconOnly && label ? <Text style={[styles.controlButtonText, textStyle]}>{label}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

export function SegmentChip({ label, iconName, active, onPress, size = 'compact', style }) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, metrics), [palette, isDark, metrics]);
  const heightStyle = getHeightStyle(size);
  const color = active ? palette.onAccent : palette.ink700;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentChip,
        heightStyle,
        active && styles.segmentChipActive,
        pressed && styles.pressed,
        style,
      ]}
    >
      {iconName ? <Ionicons name={iconName} size={14} color={color} /> : null}
      <Text style={[styles.segmentChipText, active && styles.segmentChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ label, iconName, iconColor, tone = 'neutral', style }) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, metrics), [palette, isDark, metrics]);

  return (
    <View style={[styles.statusPill, styles[`statusPill_${tone}`] || styles.statusPill_neutral, style]}>
      {iconName ? (
        <Ionicons
          name={iconName}
          size={11}
          color={iconColor || palette.heroSubtitle}
        />
      ) : null}
      <Text style={[styles.statusPillText, styles[`statusPillText_${tone}`] || styles.statusPillText_neutral]}>
        {label}
      </Text>
    </View>
  );
}

export function SplitExportButton({
  format,
  options = EXPORT_OPTIONS,
  loading = false,
  disabled = false,
  onExport,
  onSelectFormat,
  size = 'action',
  showFormatLabel = true,
  compactMenu = false,
  style,
}) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, metrics), [palette, isDark, metrics]);
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = options.find((option) => option.key === format) || options[0] || EXPORT_OPTIONS[0];
  const heightStyle = getHeightStyle(size);
  const inactive = disabled || loading;

  function handleSelect(nextFormat) {
    onSelectFormat?.(nextFormat);
    setMenuOpen(false);
  }

  return (
    <View style={[styles.splitShell, style]}>
      <View style={[styles.splitButton, heightStyle, compactMenu && styles.splitButtonCompact]}>
        <Pressable
          onPress={onExport}
          disabled={inactive}
          style={({ pressed }) => [
            styles.splitMain,
            pressed && !inactive ? styles.splitMainPressed : null,
            inactive && styles.disabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={palette.ink900} />
          ) : (
            <Ionicons name={selected.iconName} size={size === 'action' ? 16 : 13} color={palette.ink900} />
          )}
          <Text style={styles.splitMainText}>{loading ? 'Exporting...' : 'Export'}</Text>
        </Pressable>

        <View style={[styles.splitDivider, compactMenu && styles.splitDividerCompact]} />

        <Pressable
          onPress={() => setMenuOpen((current) => !current)}
          disabled={inactive}
          style={({ pressed }) => [
            styles.splitToggle,
            compactMenu && styles.splitToggleCompact,
            !showFormatLabel && styles.splitToggleIconOnly,
            pressed && !inactive ? styles.splitTogglePressed : null,
            inactive && styles.disabled,
          ]}
        >
          {showFormatLabel ? <Text style={styles.splitToggleText}>{selected.label}</Text> : null}
          <Ionicons name={menuOpen ? 'chevron-up' : 'chevron-down'} size={13} color={palette.ink900} />
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={[styles.splitMenu, compactMenu && styles.splitMenuCompact]}>
          {options.map((option, index) => {
            const active = option.key === selected.key;

            return (
              <Pressable
                key={option.key}
                onPress={() => handleSelect(option.key)}
                style={({ pressed }) => [
                  styles.splitMenuItem,
                  index === options.length - 1 && styles.splitMenuItemLast,
                  active && styles.splitMenuItemActive,
                  pressed && styles.splitMenuItemPressed,
                ]}
              >
                <Ionicons name={option.iconName} size={14} color={active ? palette.teal600 : palette.ink700} />
                <Text style={[styles.splitMenuItemText, active && styles.splitMenuItemTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function YearStepper({
  year,
  onChangeYear,
  loading = false,
  accessibilityPrefix = 'chart',
  header = false,
  centered = false,
  style,
}) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, metrics), [palette, isDark, metrics]);

  return (
    <View style={[styles.yearStepper, centered && styles.yearStepperCentered, header && styles.yearStepperHeader, style]}>
      <LinearGradient pointerEvents="none" colors={[palette.mist, palette.card]} style={StyleSheet.absoluteFillObject} />
      <Pressable
        onPress={() => onChangeYear(year - 1)}
        disabled={loading}
        accessibilityLabel={`Show ${year - 1} ${accessibilityPrefix}`}
        style={({ pressed }) => [
          styles.yearStepperButton,
          header && styles.yearStepperHeaderButton,
          pressed && !loading ? styles.pressed : null,
          loading ? styles.disabled : null,
        ]}
      >
        <Ionicons name="chevron-back" size={16} color={palette.teal600} />
      </Pressable>

      <View style={[styles.yearStepperValueWrap, header && styles.yearStepperHeaderValue]}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.yearStepperText}>{year}</Text>
        {loading ? <ActivityIndicator size="small" color={palette.teal600} /> : null}
      </View>

      <Pressable
        onPress={() => onChangeYear(year + 1)}
        disabled={loading}
        accessibilityLabel={`Show ${year + 1} ${accessibilityPrefix}`}
        style={({ pressed }) => [
          styles.yearStepperButton,
          header && styles.yearStepperHeaderButton,
          pressed && !loading ? styles.pressed : null,
          loading ? styles.disabled : null,
        ]}
      >
        <Ionicons name="chevron-forward" size={16} color={palette.teal600} />
      </Pressable>
    </View>
  );
}

export function ChartZoomControls({
  zoomPercent,
  canZoomOut,
  canZoomIn,
  onZoomOut,
  onZoomIn,
  onReset,
  resetDisabled = false,
  accessibilityPrefix = 'chart',
}) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, metrics), [palette, isDark, metrics]);

  return (
    <View style={styles.chartZoomControls}>
      <Pressable
        onPress={onZoomOut}
        disabled={!canZoomOut}
        accessibilityLabel={`Zoom out ${accessibilityPrefix}`}
        style={({ pressed }) => [
          styles.chartZoomButton,
          pressed && canZoomOut ? styles.pressed : null,
          !canZoomOut ? styles.disabled : null,
        ]}
      >
        <Ionicons name="remove" size={15} color={palette.ink900} />
      </Pressable>
      <Pressable
        onPress={onReset}
        disabled={resetDisabled}
        accessibilityLabel={`Reset ${accessibilityPrefix} zoom`}
        style={({ pressed }) => [
          styles.chartZoomValueButton,
          pressed && !resetDisabled ? styles.pressed : null,
          resetDisabled ? styles.chartZoomValueDisabled : null,
        ]}
      >
        <Ionicons name="resize-outline" size={14} color={palette.ink900} />
        <Text style={styles.chartZoomValueText}>{zoomPercent}%</Text>
      </Pressable>
      <Pressable
        onPress={onZoomIn}
        disabled={!canZoomIn}
        accessibilityLabel={`Zoom in ${accessibilityPrefix}`}
        style={({ pressed }) => [
          styles.chartZoomButton,
          pressed && canZoomIn ? styles.pressed : null,
          !canZoomIn ? styles.disabled : null,
        ]}
      >
        <Ionicons name="add" size={15} color={palette.ink900} />
      </Pressable>
    </View>
  );
}

export function EmptyState({ title, body, iconName = 'document-text-outline', style }) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, metrics), [palette, isDark, metrics]);

  return (
    <View style={[styles.emptyState, style]}>
      <View style={styles.emptyStateIcon}>
        <Ionicons name={iconName} size={20} color={palette.ink900} />
      </View>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {body ? <Text style={styles.emptyStateBody}>{body}</Text> : null}
    </View>
  );
}

export function LoadingState({ label = 'Loading data', iconName = 'sync-outline', style }) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, metrics), [palette, isDark, metrics]);

  return (
    <View style={[styles.loadingState, style]}>
      <View style={styles.loadingStateIcon}>
        <ActivityIndicator color={palette.teal600} />
      </View>
      <View style={styles.loadingStateCopy}>
        <View style={styles.loadingStateTitleRow}>
          <Ionicons name={iconName} size={13} color={palette.ink500} />
          <Text style={styles.loadingStateTitle}>{label}</Text>
        </View>
        <View style={styles.loadingSkeletonLine} />
        <View style={[styles.loadingSkeletonLine, styles.loadingSkeletonLineShort]} />
      </View>
    </View>
  );
}

function getHeightStyle(size) {
  const height = CONTROL_HEIGHTS[size] || CONTROL_HEIGHTS.compact;
  return { height, minHeight: height };
}

function getToneColor(tone, palette, isDark) {
  if (tone === 'success') {
    return palette.ink900;
  }
  if (tone === 'export') {
    return palette.ink900;
  }
  if (tone === 'danger') {
    return isDark ? palette.errorText : palette.rose500;
  }
  return palette.ink900;
}

function createStyles(palette, isDark, metrics) {
  return StyleSheet.create(scaleStyleDefinitions({
    controlButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 0,
      borderRadius: 999,
    },
    controlButtonIconOnly: {
      width: 36,
      minWidth: 36,
      paddingHorizontal: 0,
      borderRadius: 12,
    },
    controlButton_neutral: {
      borderColor: palette.line,
      backgroundColor: isDark ? palette.mist : '#F7FBFF',
    },
    controlButton_success: {
      borderColor: isDark ? '#1A655E' : '#B4E5DE',
      backgroundColor: isDark ? '#11312D' : '#E5F5F3',
    },
    controlButton_export: {
      borderColor: isDark ? '#31506E' : '#C9DDF3',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderRadius: 8,
    },
    controlButtonText: {
      color: palette.ink900,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0,
    },
    segmentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 0,
      borderRadius: 999,
      backgroundColor: isDark ? '#132131' : '#F3F8FD',
      borderWidth: 1,
      borderColor: palette.line,
    },
    segmentChipActive: {
      backgroundColor: palette.navy700,
      borderColor: palette.cyan300,
    },
    segmentChipText: {
      color: palette.ink700,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0,
    },
    segmentChipTextActive: {
      color: palette.onAccent,
    },
    splitShell: {
      position: 'relative',
      zIndex: 120,
      elevation: 120,
    },
    splitButton: {
      flexDirection: 'row',
      alignItems: 'stretch',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? '#1A655E' : '#B4E5DE',
      backgroundColor: isDark ? '#102824' : '#F3FCFA',
      borderRadius: 16,
    },
    splitButtonCompact: {
      borderColor: isDark ? '#31506E' : '#C9DDF3',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderRadius: 10,
    },
    splitMain: {
      flex: 1,
      minWidth: 78,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 8,
    },
    splitMainPressed: {
      backgroundColor: isDark ? '#143530' : '#E4F8F4',
    },
    splitMainText: {
      color: palette.ink900,
      fontSize: 10,
      fontWeight: '800',
      lineHeight: 12,
      letterSpacing: 0,
    },
    splitDivider: {
      width: 1,
      backgroundColor: isDark ? '#1A655E' : '#B4E5DE',
    },
    splitDividerCompact: {
      backgroundColor: isDark ? '#31506E' : '#C9DDF3',
    },
    splitToggle: {
      minWidth: 58,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      backgroundColor: isDark ? '#11312D' : '#E5F5F3',
    },
    splitToggleCompact: {
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
    },
    splitToggleIconOnly: {
      width: 38,
      minWidth: 38,
      paddingHorizontal: 0,
    },
    splitTogglePressed: {
      backgroundColor: isDark ? '#173B36' : '#DDF4EF',
    },
    splitToggleText: {
      color: palette.ink900,
      fontSize: 9,
      fontWeight: '800',
      lineHeight: 11,
      letterSpacing: 0,
    },
    splitMenu: {
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: 6,
      minWidth: 104,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#1A655E' : '#B4E5DE',
      backgroundColor: isDark ? '#102824' : '#F3FCFA',
      overflow: 'hidden',
      zIndex: 140,
      elevation: 140,
      shadowColor: '#09131C',
      shadowOpacity: isDark ? 0.28 : 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
    },
    splitMenuCompact: {
      top: 42,
      marginTop: 0,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
      backgroundColor: isDark ? '#0C1824' : '#FFFFFF',
      padding: 5,
      borderRadius: 8,
    },
    splitMenuItem: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#1A655E' : '#D7EEEA',
    },
    splitMenuItemLast: {
      borderBottomWidth: 0,
    },
    splitMenuItemActive: {
      backgroundColor: isDark ? '#173B36' : '#DDF4EF',
    },
    splitMenuItemPressed: {
      backgroundColor: isDark ? '#143530' : '#E4F8F4',
    },
    splitMenuItemText: {
      color: palette.ink700,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0,
    },
    splitMenuItemTextActive: {
      color: palette.teal600,
    },
    statusPill: {
      height: 32,
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      paddingHorizontal: 6,
      borderRadius: 999,
    },
    statusPill_success: {
      borderColor: isDark ? '#167C65' : '#0F9F83',
      backgroundColor: isDark ? '#073C35' : '#E8FFF8',
    },
    statusPill_warning: {
      borderColor: isDark ? '#8A6514' : '#D59B16',
      backgroundColor: isDark ? '#33240B' : '#FFF8E7',
    },
    statusPill_error: {
      borderColor: isDark ? '#803145' : '#E11D48',
      backgroundColor: isDark ? '#35121C' : '#FFF0F3',
    },
    statusPill_neutral: {
      borderColor: isDark ? '#294C68' : '#BFD4E7',
      backgroundColor: isDark ? '#101D2A' : '#F8FCFF',
    },
    statusPillText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0,
    },
    statusPillText_success: {
      color: isDark ? '#82E6D6' : '#0F766E',
    },
    statusPillText_warning: {
      color: isDark ? '#F7CA72' : '#9A6700',
    },
    statusPillText_error: {
      color: isDark ? '#FF9DB1' : '#BE123C',
    },
    statusPillText_neutral: {
      color: isDark ? '#D2DCE7' : '#334155',
    },
    yearStepper: {
      height: 44,
      minHeight: 44,
      width: '100%',
      maxWidth: 220,
      alignSelf: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.teal600,
      borderRadius: 10,
      flexDirection: 'row',
      alignItems: 'center',
    },
    yearStepperCentered: {
      alignSelf: 'center',
    },
    yearStepperHeader: {
      height: 30,
      minHeight: 30,
      width: 104,
      maxWidth: 104,
      borderRadius: 8,
    },
    yearStepperButton: {
      width: 42,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    yearStepperHeaderButton: {
      width: 28,
    },
    yearStepperValueWrap: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 6,
      zIndex: 1,
    },
    yearStepperHeaderValue: {
      paddingHorizontal: 0,
    },
    yearStepperText: {
      color: palette.ink900,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '900',
      letterSpacing: 0,
      textAlign: 'center',
    },
    chartZoomControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
    },
    chartZoomButton: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.lineStrong,
      backgroundColor: isDark ? '#10243A' : '#F7FBFF',
      borderRadius: 8,
    },
    chartZoomValueButton: {
      height: 30,
      minWidth: 58,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: palette.teal600,
      backgroundColor: isDark ? '#0D3A34' : '#E5F8F6',
      borderRadius: 8,
    },
    chartZoomValueDisabled: {
      opacity: 0.8,
    },
    chartZoomValueText: {
      color: palette.ink900,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 22,
    },
    emptyStateIcon: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#294C68' : '#BFD4E7',
      backgroundColor: isDark ? '#101D2A' : '#F8FCFF',
      borderRadius: 12,
    },
    emptyStateTitle: {
      color: palette.ink900,
      fontSize: 15,
      fontWeight: '900',
      textAlign: 'center',
      letterSpacing: 0,
    },
    emptyStateBody: {
      color: palette.ink500,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      textAlign: 'center',
      maxWidth: 360,
      letterSpacing: 0,
    },
    loadingState: {
      minHeight: 104,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: isDark ? '#203246' : '#D8E4F0',
      backgroundColor: isDark ? '#0C1621' : '#F9FCFF',
      padding: 14,
      borderRadius: 12,
    },
    loadingStateIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: isDark ? '#10243A' : '#EAF6FF',
    },
    loadingStateCopy: {
      flex: 1,
      gap: 8,
    },
    loadingStateTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    loadingStateTitle: {
      color: palette.ink700,
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    loadingSkeletonLine: {
      height: 8,
      width: '100%',
      borderRadius: 999,
      backgroundColor: isDark ? '#17283A' : '#E2ECF6',
    },
    loadingSkeletonLineShort: {
      width: '64%',
    },
    disabled: {
      opacity: 0.65,
    },
    pressed: {
      transform: [{ scale: 0.98 }],
    },
  }, metrics, {
    exclude: [
      'controlButton.height',
      'controlButton.minHeight',
      'controlButtonIconOnly.width',
      'controlButtonIconOnly.minWidth',
      'splitButton.height',
      'splitButton.minHeight',
    ],
  }));
}
