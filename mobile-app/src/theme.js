export const lightPalette = {
  navy900: '#11233B',
  navy700: '#1D3C64',
  teal600: '#0D9488',
  teal500: '#14B8A6',
  cyan300: '#67E8F9',
  amber500: '#F59E0B',
  rose500: '#E11D48',
  ink900: '#122033',
  ink700: '#334155',
  ink500: '#64748B',
  line: '#D7E0EA',
  lineStrong: '#9EB3C8',
  card: '#FFFFFF',
  canvas: '#EDF4FA',
  mist: '#DCEAF8',
  successBg: '#E8FFF8',
  successText: '#0F766E',
  errorBg: '#FFF0F3',
  errorText: '#BE123C',
  warningBg: '#FFF8E7',
  warningText: '#B45309',
  onAccent: '#FFFFFF',
  appSafeArea: '#11233B',
  heroSubtitle: '#D7E6F7',
  overlay: 'rgba(15, 23, 42, 0.08)',
};

export const darkPalette = {
  navy900: '#07131F',
  navy700: '#12304B',
  teal600: '#1CC7B4',
  teal500: '#38D7C2',
  cyan300: '#67E8F9',
  amber500: '#F6C25B',
  rose500: '#FB7185',
  ink900: '#F3F7FC',
  ink700: '#D2DCE7',
  ink500: '#98AABD',
  line: '#243447',
  lineStrong: '#3E5972',
  card: '#0F1A26',
  canvas: '#061019',
  mist: '#0E1E2D',
  successBg: '#0C2C24',
  successText: '#82E6D6',
  errorBg: '#35121C',
  errorText: '#FF9DB1',
  warningBg: '#33240B',
  warningText: '#F7CA72',
  onAccent: '#F8FCFF',
  appSafeArea: '#030A11',
  heroSubtitle: '#AFC0D5',
  overlay: 'rgba(0, 0, 0, 0.28)',
};

export const themes = {
  light: {
    mode: 'light',
    isDark: false,
    palette: lightPalette,
    shadows: {
      card: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 4,
      },
    },
    statusBar: 'light',
  },
  dark: {
    mode: 'dark',
    isDark: true,
    palette: darkPalette,
    shadows: {
      card: {
        shadowColor: '#000000',
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
        elevation: 4,
      },
    },
    statusBar: 'light',
  },
};

export const palette = lightPalette;
export const shadows = themes.light.shadows;

export function getResponsiveMetrics(width = 390) {
  const screenWidth = Number.isFinite(width) ? width : 390;
  const isTablet = screenWidth >= 700;
  const isLargeTablet = screenWidth >= 980;
  const scale = isLargeTablet ? 1.24 : isTablet ? 1.14 : 1;

  return {
    width: screenWidth,
    isTablet,
    isLargeTablet,
    scale,
    contentPadding: isLargeTablet ? 28 : isTablet ? 24 : 16,
    contentGap: isTablet ? 18 : 14,
    contentMaxWidth: isLargeTablet ? 1180 : isTablet ? 940 : undefined,
  };
}

const SCALABLE_STYLE_KEYS = new Set([
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'gap',
  'rowGap',
  'columnGap',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingHorizontal',
  'paddingVertical',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'borderRadius',
  'minHeight',
  'minWidth',
]);

export function responsiveValue(value, metrics, ratio = 1) {
  if (typeof value !== 'number') {
    return value;
  }

  return Math.round(value * metrics.scale * ratio);
}

export function scaleStyleDefinitions(definitions, metrics, options = {}) {
  const excludedKeys = new Set(options.exclude || []);
  const scaledKeys = options.keys || SCALABLE_STYLE_KEYS;
  const iconScaleKeys = new Set(options.iconKeys || ['width', 'height']);

  return Object.fromEntries(
    Object.entries(definitions).map(([styleName, style]) => [
      styleName,
      Object.fromEntries(
        Object.entries(style).map(([key, value]) => {
          if (excludedKeys.has(`${styleName}.${key}`) || excludedKeys.has(key)) {
            return [key, value];
          }

          if (scaledKeys.has(key)) {
            return [key, responsiveValue(value, metrics)];
          }

          if (iconScaleKeys.has(key) && typeof value === 'number' && value <= 260) {
            return [key, responsiveValue(value, metrics)];
          }

          return [key, value];
        })
      ),
    ])
  );
}
