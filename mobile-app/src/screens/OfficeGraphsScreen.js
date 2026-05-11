import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Print from 'expo-print';
import * as XLSX from 'xlsx';
import { BarChart } from 'react-native-gifted-charts';
import Card from '../components/Card';
import MessageBanner from '../components/MessageBanner';
import ScreenShell from '../components/ScreenShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getOfficeDashboardSnapshot } from '../services/office';
import { saveNativeExportFile, buildNativeExportSuccessMessage } from '../utils/exportFiles';

function formatNumber(value, decimals = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '-';
  }

  return parsed.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function roundExportNumber(value, decimals = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Number(parsed.toFixed(decimals));
}

function displayExportValue(value) {
  if (typeof value === 'number') {
    return formatNumber(value, 2);
  }

  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildExportFileName(extension) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `monthly-analytics-${stamp}.${extension}`;
}

function sortExportRows(rows = []) {
  return [...rows].sort((a, b) => String(a.key || '').localeCompare(String(b.key || '')));
}

function buildSheetRows(columns, rows) {
  return [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => column.render(row))),
  ];
}

function buildAnalyticsExportSections({ monthlyProduction, monthlyPowerConsumption, monthlyChemicalUsage }) {
  const productionRows = sortExportRows(monthlyProduction?.rows);
  const powerRows = sortExportRows(monthlyPowerConsumption?.rows);
  const chemicalRows = sortExportRows(monthlyChemicalUsage?.rows);

  return [
    {
      title: 'Summary',
      sheetName: 'Summary',
      columns: [
        { label: 'Metric', render: (row) => row.metric },
        { label: 'Value', render: (row) => roundExportNumber(row.value) },
      ],
      rows: [
        { metric: 'Total Production', value: monthlyProduction?.totalProduction ?? 0 },
        { metric: 'Total Power', value: monthlyPowerConsumption?.totalPower ?? 0 },
        { metric: 'Total Chlorine', value: monthlyChemicalUsage?.totalChlorine ?? 0 },
        { metric: 'Total Peroxide', value: monthlyChemicalUsage?.totalPeroxide ?? 0 },
      ],
    },
    {
      title: 'Monthly Production',
      sheetName: 'Production',
      columns: [
        { label: 'Month', render: (row) => row.label },
        { label: 'Production', render: (row) => roundExportNumber(row.production) },
      ],
      rows: productionRows,
    },
    {
      title: 'Monthly Power Usage',
      sheetName: 'Power Usage',
      columns: [
        { label: 'Month', render: (row) => row.label },
        { label: 'Chlorination Power', render: (row) => roundExportNumber(row.chlorinationPower) },
        { label: 'Deepwell Power', render: (row) => roundExportNumber(row.deepwellPower) },
        { label: 'Total Power', render: (row) => roundExportNumber(row.totalPower) },
      ],
      rows: powerRows,
    },
    {
      title: 'Monthly Chemical Usage',
      sheetName: 'Chemical Usage',
      columns: [
        { label: 'Month', render: (row) => row.label },
        { label: 'Chlorine', render: (row) => roundExportNumber(row.chlorineUsage) },
        { label: 'Peroxide', render: (row) => roundExportNumber(row.peroxideUsage) },
        { label: 'Total Chemical', render: (row) => roundExportNumber(row.totalUsage) },
      ],
      rows: chemicalRows,
    },
  ];
}

function buildPdfSection(section) {
  const head = section.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = section.rows
    .map((row) => {
      const cells = section.columns
        .map((column) => `<td>${escapeHtml(displayExportValue(column.render(row)))}</td>`)
        .join('');

      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>
  `;
}

function buildAnalyticsPdfDocument(sections) {
  const generatedAt = new Date().toLocaleString('en-US');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; padding: 24px; }
          h1 { margin: 0 0 6px; font-size: 24px; }
          .meta { margin: 0 0 18px; color: #475569; font-size: 12px; }
          section { margin-top: 20px; page-break-inside: avoid; }
          h2 { margin: 0 0 10px; font-size: 16px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 7px; vertical-align: top; word-wrap: break-word; }
          th { background: #0f766e; color: #ffffff; font-weight: 700; }
          tr:nth-child(even) td { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>Monthly Analytics Export</h1>
        <p class="meta">Generated: ${escapeHtml(generatedAt)}</p>
        ${sections.map(buildPdfSection).join('')}
      </body>
    </html>
  `;
}

function SectionHeader({ title, body, iconName = 'bar-chart-outline', iconColor, styles }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={iconName} size={14} color={iconColor} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {body ? <Text style={styles.sectionBody}>{body}</Text> : null}
    </View>
  );
}

function GraphSkeletonCard({ styles, cardStyle, isDaily = false, isSplit = false }) {
  const pulseOpacity = useRef(new Animated.Value(0.55)).current;
  const barHeights = isDaily
    ? [88, 132, 104, 156, 118, 178, 142, 96, 164, 124, 148, 108]
    : [96, 140, 118, 168, 132, 188, 150, 112, 176, 136];

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0.55,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulseOpacity]);

  const skeletonStyle = (style) => [
    styles.skeletonBlock,
    ...(Array.isArray(style) ? style : [style]),
    { opacity: pulseOpacity },
  ];

  return (
    <Card style={[styles.panelCard, cardStyle]}>
      <View style={styles.skeletonHeaderRow}>
        <Animated.View style={skeletonStyle(styles.skeletonIcon)} />
        <Animated.View style={skeletonStyle(styles.skeletonTitleLine)} />
      </View>

      <View style={styles.skeletonMetaRow}>
        <Animated.View style={skeletonStyle(styles.skeletonSummaryPill)} />
        <Animated.View style={skeletonStyle(styles.skeletonToolbarPill)} />
      </View>

      <View style={[styles.skeletonChartArea, isDaily && styles.skeletonChartAreaTall]}>
        <View style={styles.skeletonAxisColumn}>
          {[0, 1, 2, 3].map((item) => (
            <Animated.View key={item} style={skeletonStyle(styles.skeletonAxisTick)} />
          ))}
        </View>
        <View style={styles.skeletonBarsRow}>
          {barHeights.map((height, index) => (
            <View key={`${height}-${index}`} style={styles.skeletonBarSlot}>
              {isSplit ? (
                <>
                  <Animated.View style={skeletonStyle([styles.skeletonBarSegmentTop, { height: Math.round(height * 0.42) }])} />
                  <Animated.View style={skeletonStyle([styles.skeletonBarSegmentBottom, { height: Math.round(height * 0.58) }])} />
                </>
              ) : (
                <Animated.View style={skeletonStyle([styles.skeletonBar, { height }])} />
              )}
              <Animated.View style={skeletonStyle(styles.skeletonBarLabel)} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.skeletonLegendRow}>
        <Animated.View style={skeletonStyle(styles.skeletonLegendItem)} />
        {isSplit ? <Animated.View style={skeletonStyle(styles.skeletonLegendItem)} /> : null}
      </View>
    </Card>
  );
}

function GraphSkeletonGrid({ styles, useTwoColumnCharts }) {
  const cardStyle = useTwoColumnCharts ? styles.chartGridCard : null;

  return (
    <View style={styles.chartGrid}>
      <GraphSkeletonCard styles={styles} cardStyle={cardStyle} />
      <GraphSkeletonCard styles={styles} cardStyle={cardStyle} isDaily />
      <GraphSkeletonCard styles={styles} cardStyle={cardStyle} isSplit />
      <GraphSkeletonCard styles={styles} cardStyle={cardStyle} isSplit />
    </View>
  );
}

function ChartValueDetails({ selected, styles }) {
  if (!selected) {
    return null;
  }

  const isCompact = selected.items.length === 1 && !selected.totalLabel;
  const isSplitCompact = selected.items.length > 1;

  return (
    <View
      style={[
        styles.chartValueDetails,
        isCompact && styles.chartValueDetailsCompact,
        isSplitCompact && styles.chartValueDetailsSplitCompact,
      ]}
    >
      <View
        style={[
          styles.chartValueDetailsHeader,
          isCompact && styles.chartValueDetailsHeaderCompact,
          isSplitCompact && styles.chartValueDetailsHeaderSplitCompact,
        ]}
      >
        <Text style={styles.chartValueDetailsTitle}>{selected.title}</Text>
      </View>

      <View
        style={[
          styles.chartValueDetailsRow,
          isCompact && styles.chartValueDetailsRowCompact,
          isSplitCompact && styles.chartValueDetailsRowSplitCompact,
        ]}
      >
        {selected.items.map((item) => (
          <View
            key={item.label}
            style={[
              styles.chartValueDetailsItem,
              isCompact && styles.chartValueDetailsItemCompact,
              isSplitCompact && styles.chartValueDetailsItemSplitCompact,
            ]}
          >
            <View style={[styles.chartValueDetailsDot, { backgroundColor: item.color }]} />
            {item.iconName ? <Ionicons name={item.iconName} size={12} color={item.color} /> : null}
            {!isCompact ? <Text style={styles.chartValueDetailsLabel}>{item.label}</Text> : null}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
              style={styles.chartValueDetailsValue}
            >
              {formatNumber(item.value, 2)}
            </Text>
          </View>
        ))}
      </View>

      {selected.totalLabel ? (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
          style={styles.chartValueDetailsTotal}
        >
          {selected.totalLabel}: {formatNumber(selected.totalValue, 2)}
        </Text>
      ) : null}
    </View>
  );
}

const MIN_CHART_ZOOM = 0.75;
const MAX_CHART_ZOOM = 2;
const CHART_ZOOM_STEP = 0.25;

function MonthlyProductionCard({ monthlyProduction, palette, isDark, isWide, screenWidth, styles, cardStyle }) {
  const rows = monthlyProduction?.rows ?? [];
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedBar, setSelectedBar] = useState(null);
  const totalProduction =
    monthlyProduction?.totalProduction ??
    rows.reduce((sum, row) => sum + (Number(row.production) || 0), 0);
  const maxVolume = Math.max(
    ...rows.map((row) => row.production || 0),
    1
  );
  const chartHeight = isWide ? 260 : 220;
  const baseBarWidth = isWide ? 34 : 30;
  const baseSpacing = isWide ? 42 : 32;
  const barWidth = Math.round(baseBarWidth * zoomLevel);
  const spacing = Math.round(baseSpacing * zoomLevel);
  const rawViewportWidth = Math.max(280, screenWidth - (isWide ? 120 : 72));
  const baseContentWidth = Math.max(rows.length * (baseBarWidth + baseSpacing) + 90, isWide ? 820 : 560);
  const chartViewportWidth = Math.min(rawViewportWidth, Math.max(280, baseContentWidth - 120));
  const chartMaxValue = maxVolume <= 0 ? 1 : Math.ceil(maxVolume * 1.18);
  const hasData = rows.some((row) => row.production > 0);
  const zoomPercent = Math.round(zoomLevel * 100);
  const canZoomOut = zoomLevel > MIN_CHART_ZOOM;
  const canZoomIn = zoomLevel < MAX_CHART_ZOOM;
  const valueLabelWidth = Math.round(Math.max(52, Math.min(74, barWidth + 28)));
  const valueLabelFontSize = zoomLevel >= 1.35 ? 10 : 9;
  const topLabelContainerStyle = {
    width: valueLabelWidth,
    height: 18,
    left: (barWidth - valueLabelWidth) / 2,
    justifyContent: 'center',
    alignItems: 'center',
  };
  const updateZoom = (change) => {
    setZoomLevel((currentZoom) => {
      const nextZoom = currentZoom + change;
      return Math.min(MAX_CHART_ZOOM, Math.max(MIN_CHART_ZOOM, Number(nextZoom.toFixed(2))));
    });
  };
  const chartData = rows.map((row) => {
    const production = Math.max(0, row.production || 0);

    return {
      value: production,
      label: row.label,
      frontColor: palette.teal600,
      gradientColor: palette.cyan300,
      onPress: () =>
        setSelectedBar({
          title: row.label,
          items: [{ label: 'Production', value: production, color: palette.teal600 }],
        }),
      topLabelContainerStyle,
      topLabelComponent: () =>
        row.production > 0 ? (
          <View style={styles.chartPlainValueWrap}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.chartPlainValueText, { fontSize: valueLabelFontSize }]}>
              {formatNumber(row.production, 2)}
            </Text>
          </View>
        ) : null,
    };
  });

  return (
    <Card style={[styles.panelCard, cardStyle]}>
      <SectionHeader
        title="Monthly Production"
        iconName="bar-chart-outline"
        iconColor={palette.teal600}
        styles={styles}
      />

      <View style={[styles.chartMetaRow, !isWide && styles.chartMetaRowCompact]}>
        <View style={[styles.productionSummaryPill, isWide && styles.productionSummaryPillWide]}>
          <View style={styles.productionSummaryAccent} />
          <View style={styles.productionSummaryIcon}>
            <Ionicons name="analytics-outline" size={15} color={palette.teal600} />
          </View>
          <View style={styles.productionSummaryCopy}>
            <Text style={styles.productionSummaryLabel}>Total Production</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.productionSummaryValue}>
              {formatNumber(totalProduction)}
            </Text>
            <Text style={styles.productionSummaryHint}>Latest 10 months</Text>
          </View>
        </View>

        <View style={[styles.chartToolbar, !isWide && styles.chartToolbarCompact]}>
          <Text style={styles.chartToolbarLabel}>Zoom</Text>
          <View style={styles.zoomControls}>
            <Pressable
              onPress={() => updateZoom(-CHART_ZOOM_STEP)}
              disabled={!canZoomOut}
              accessibilityLabel="Zoom out"
              style={({ pressed }) => [
                styles.zoomButton,
                pressed && canZoomOut ? styles.pressed : null,
                !canZoomOut ? styles.zoomButtonDisabled : null,
              ]}
            >
              <Ionicons name="remove" size={15} color={palette.ink900} />
            </Pressable>
            <Pressable
              onPress={() => setZoomLevel(1)}
              disabled={zoomLevel === 1}
              accessibilityLabel="Reset zoom"
              style={({ pressed }) => [
                styles.zoomValueButton,
                pressed && zoomLevel !== 1 ? styles.pressed : null,
                zoomLevel === 1 ? styles.zoomValueButtonDisabled : null,
              ]}
            >
              <Ionicons name="resize-outline" size={14} color={palette.ink900} />
              <Text style={styles.zoomValueText}>{zoomPercent}%</Text>
            </Pressable>
            <Pressable
              onPress={() => updateZoom(CHART_ZOOM_STEP)}
              disabled={!canZoomIn}
              accessibilityLabel="Zoom in"
              style={({ pressed }) => [
                styles.zoomButton,
                pressed && canZoomIn ? styles.pressed : null,
                !canZoomIn ? styles.zoomButtonDisabled : null,
              ]}
            >
              <Ionicons name="add" size={15} color={palette.ink900} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.productionChart}>
        <BarChart
          data={chartData}
          width={chartViewportWidth}
          height={chartHeight}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={18}
          endSpacing={18}
          maxValue={chartMaxValue}
          noOfSections={4}
          showGradient
          roundedBottom={false}
          barBorderTopLeftRadius={5}
          barBorderTopRightRadius={5}
          barBorderBottomLeftRadius={0}
          barBorderBottomRightRadius={0}
          isAnimated
          animationDuration={800}
          showValuesAsTopLabel={false}
          xAxisColor={palette.lineStrong}
          yAxisColor={palette.lineStrong}
          rulesColor={palette.line}
          rulesThickness={1}
          yAxisTextStyle={styles.chartAxisLabel}
          xAxisLabelTextStyle={styles.chartMonthLabel}
          yAxisLabelWidth={56}
          xAxisTextNumberOfLines={1}
          labelsExtraHeight={28}
          formatYLabel={(value) => formatNumber(value, 0)}
          disableScroll={false}
          nestedScrollEnabled
          showScrollIndicator
          indicatorColor={isDark ? 'white' : 'black'}
        />
      </View>

      <ChartValueDetails selected={selectedBar} styles={styles} />

      <View style={styles.productionLegendRow}>
        <View style={styles.productionLegendItem}>
          <View style={[styles.productionLegendSwatch, styles.productionLegendProduction]} />
          <Text style={styles.productionLegendText}>Production</Text>
        </View>
      </View>

      {!hasData ? (
        <MessageBanner tone="info">Monthly production will appear here after readings with totalizer values are saved.</MessageBanner>
      ) : null}
    </Card>
  );
}

function MonthlyPowerConsumptionCard({ monthlyPowerConsumption, palette, isDark, isWide, screenWidth, styles, cardStyle }) {
  const rows = monthlyPowerConsumption?.rows ?? [];
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedBar, setSelectedBar] = useState(null);
  const chlorinationPowerColor = isDark ? palette.teal500 : palette.teal600;
  const deepwellPowerColor = palette.amber500;
  const totalPower =
    monthlyPowerConsumption?.totalPower ??
    rows.reduce((sum, row) => sum + (Number(row.totalPower) || 0), 0);
  const maxPower = Math.max(
    ...rows.map((row) => row.totalPower || (row.chlorinationPower || 0) + (row.deepwellPower || 0)),
    1
  );
  const chartHeight = isWide ? 270 : 230;
  const baseBarWidth = isWide ? 34 : 30;
  const baseSpacing = isWide ? 42 : 32;
  const barWidth = Math.round(baseBarWidth * zoomLevel);
  const spacing = Math.round(baseSpacing * zoomLevel);
  const rawViewportWidth = Math.max(280, screenWidth - (isWide ? 120 : 72));
  const baseContentWidth = Math.max(rows.length * (baseBarWidth + baseSpacing) + 90, isWide ? 820 : 560);
  const chartViewportWidth = Math.min(rawViewportWidth, Math.max(280, baseContentWidth - 120));
  const chartMaxValue = maxPower <= 0 ? 1 : Math.ceil(maxPower * 1.22);
  const hasData = rows.some((row) => row.totalPower > 0);
  const zoomPercent = Math.round(zoomLevel * 100);
  const canZoomOut = zoomLevel > MIN_CHART_ZOOM;
  const canZoomIn = zoomLevel < MAX_CHART_ZOOM;
  const segmentValueFontSize = zoomLevel >= 1.35 ? 8 : 7;
  const totalLabelWidth = Math.round(Math.max(56, Math.min(82, barWidth + 34)));
  const totalValueFontSize = zoomLevel >= 1.35 ? 9 : 8;
  const totalLabelContainerStyle = {
    width: totalLabelWidth,
    height: 18,
    left: (barWidth - totalLabelWidth) / 2,
    justifyContent: 'center',
    alignItems: 'center',
  };
  const renderPowerTotalLabel = (value) =>
    value > 0 ? (
      <View style={styles.chartPlainValueWrap}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.chartPlainValueText, { fontSize: totalValueFontSize }]}>
          {formatNumber(value, 2)}
        </Text>
      </View>
    ) : null;
  const renderStackValue = (value, textColor) =>
    value > 0 ? (
      <View style={styles.stackValueWrap}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[
            styles.stackValueText,
            {
              color: textColor,
              fontSize: segmentValueFontSize,
              textShadowColor: textColor === '#FFFFFF' ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.42)',
            },
          ]}
        >
          {formatNumber(value, 2)}
        </Text>
      </View>
    ) : null;
  const createPowerStack = ({ value, color, textColor, isBottom, isTop }) => ({
    value,
    color,
    borderBottomLeftRadius: isBottom ? 5 : 0,
    borderBottomRightRadius: isBottom ? 5 : 0,
    borderTopLeftRadius: isTop ? 5 : 0,
    borderTopRightRadius: isTop ? 5 : 0,
    innerBarComponent: () => renderStackValue(value, textColor),
  });
  const updateZoom = (change) => {
    setZoomLevel((currentZoom) => {
      const nextZoom = currentZoom + change;
      return Math.min(MAX_CHART_ZOOM, Math.max(MIN_CHART_ZOOM, Number(nextZoom.toFixed(2))));
    });
  };
  const chartData = rows.map((row) => {
    const chlorinationPower = Math.max(0, row.chlorinationPower || 0);
    const deepwellPower = Math.max(0, row.deepwellPower || 0);
    const totalMonthPower = Math.max(0, row.totalPower || chlorinationPower + deepwellPower);
    const powerStacks = [
      { key: 'chlorination', value: chlorinationPower, color: chlorinationPowerColor, textColor: '#FFFFFF' },
      { key: 'deepwell', value: deepwellPower, color: deepwellPowerColor, textColor: '#11233B' },
    ];

    return {
      label: row.label,
      onPress: () =>
        setSelectedBar({
          title: row.label,
          totalLabel: 'Total',
          totalValue: totalMonthPower,
          items: [
            { label: 'Chlorination', value: chlorinationPower, color: chlorinationPowerColor },
            { label: 'Deepwell', value: deepwellPower, color: deepwellPowerColor },
          ],
        }),
      topLabelContainerStyle: totalLabelContainerStyle,
      topLabelComponent: () => renderPowerTotalLabel(totalMonthPower),
      stacks: powerStacks.map((stack, index) =>
        createPowerStack({
          ...stack,
          isBottom: index === 0,
          isTop: index === powerStacks.length - 1,
        })
      ),
    };
  });

  return (
    <Card style={[styles.panelCard, cardStyle]}>
      <SectionHeader
        title="Monthly Power Consumption"
        iconName="flash-outline"
        iconColor={palette.teal600}
        styles={styles}
      />

      <View style={[styles.chartMetaRow, !isWide && styles.chartMetaRowCompact]}>
        <View style={[styles.productionSummaryPill, isWide && styles.productionSummaryPillWide]}>
          <View style={styles.productionSummaryAccent} />
          <View style={styles.productionSummaryIcon}>
            <Ionicons name="flash-outline" size={15} color={palette.teal600} />
          </View>
          <View style={styles.productionSummaryCopy}>
            <Text style={styles.productionSummaryLabel}>Total Power</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.productionSummaryValue}>
              {formatNumber(totalPower)}
            </Text>
            <Text style={styles.productionSummaryHint}>Latest 10 months</Text>
          </View>
        </View>

        <View style={[styles.chartToolbar, !isWide && styles.chartToolbarCompact]}>
          <Text style={styles.chartToolbarLabel}>Zoom</Text>
          <View style={styles.zoomControls}>
            <Pressable
              onPress={() => updateZoom(-CHART_ZOOM_STEP)}
              disabled={!canZoomOut}
              accessibilityLabel="Zoom out power chart"
              style={({ pressed }) => [
                styles.zoomButton,
                pressed && canZoomOut ? styles.pressed : null,
                !canZoomOut ? styles.zoomButtonDisabled : null,
              ]}
            >
              <Ionicons name="remove" size={15} color={palette.ink900} />
            </Pressable>
            <Pressable
              onPress={() => setZoomLevel(1)}
              disabled={zoomLevel === 1}
              accessibilityLabel="Reset power chart zoom"
              style={({ pressed }) => [
                styles.zoomValueButton,
                pressed && zoomLevel !== 1 ? styles.pressed : null,
                zoomLevel === 1 ? styles.zoomValueButtonDisabled : null,
              ]}
            >
              <Ionicons name="resize-outline" size={14} color={palette.ink900} />
              <Text style={styles.zoomValueText}>{zoomPercent}%</Text>
            </Pressable>
            <Pressable
              onPress={() => updateZoom(CHART_ZOOM_STEP)}
              disabled={!canZoomIn}
              accessibilityLabel="Zoom in power chart"
              style={({ pressed }) => [
                styles.zoomButton,
                pressed && canZoomIn ? styles.pressed : null,
                !canZoomIn ? styles.zoomButtonDisabled : null,
              ]}
            >
              <Ionicons name="add" size={15} color={palette.ink900} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.productionChart}>
        <BarChart
          stackData={chartData}
          width={chartViewportWidth}
          height={chartHeight}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={18}
          endSpacing={18}
          maxValue={chartMaxValue}
          noOfSections={5}
          roundedTop
          roundedBottom={false}
          isAnimated
          animationDuration={800}
          xAxisColor={palette.lineStrong}
          yAxisColor={palette.lineStrong}
          rulesColor={palette.line}
          rulesThickness={1}
          yAxisTextStyle={styles.chartAxisLabel}
          xAxisLabelTextStyle={styles.chartMonthLabel}
          yAxisLabelWidth={58}
          xAxisTextNumberOfLines={1}
          labelsExtraHeight={28}
          formatYLabel={(value) => formatNumber(value, 0)}
          disableScroll={false}
          nestedScrollEnabled
          showScrollIndicator
          indicatorColor={isDark ? 'white' : 'black'}
        />
      </View>

      <ChartValueDetails selected={selectedBar} styles={styles} />

      <View style={styles.productionLegendRow}>
        <View style={styles.productionLegendItem}>
          <View style={[styles.productionLegendSwatch, styles.powerLegendChlorination]} />
          <Text style={styles.productionLegendText}>Chlorination</Text>
        </View>
        <View style={styles.productionLegendItem}>
          <View style={[styles.productionLegendSwatch, styles.powerLegendDeepwell]} />
          <Text style={styles.productionLegendText}>Deepwell</Text>
        </View>
      </View>

      {!hasData ? (
        <MessageBanner tone="info">Monthly power consumption will appear here after chlorination and deepwell power values are saved.</MessageBanner>
      ) : null}
    </Card>
  );
}

function MonthlyChemicalUsageCard({ monthlyChemicalUsage, palette, isDark, isWide, screenWidth, styles, cardStyle }) {
  const rows = monthlyChemicalUsage?.rows ?? [];
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedBar, setSelectedBar] = useState(null);
  const chlorineColor = isDark ? '#34BFA3' : '#0F8F7C';
  const peroxideColor = isDark ? '#F6C85F' : '#E7A321';
  const totalChlorine =
    monthlyChemicalUsage?.totalChlorine ??
    rows.reduce((sum, row) => sum + (Number(row.chlorineUsage) || 0), 0);
  const totalPeroxide =
    monthlyChemicalUsage?.totalPeroxide ??
    rows.reduce((sum, row) => sum + (Number(row.peroxideUsage) || 0), 0);
  const maxUsage = Math.max(
    ...rows.map((row) => row.totalUsage || (row.chlorineUsage || 0) + (row.peroxideUsage || 0)),
    1
  );
  const chartHeight = isWide ? 270 : 230;
  const baseBarWidth = isWide ? 34 : 30;
  const baseSpacing = isWide ? 42 : 32;
  const barWidth = Math.round(baseBarWidth * zoomLevel);
  const spacing = Math.round(baseSpacing * zoomLevel);
  const rawViewportWidth = Math.max(280, screenWidth - (isWide ? 120 : 72));
  const baseContentWidth = Math.max(rows.length * (baseBarWidth + baseSpacing) + 90, isWide ? 820 : 560);
  const chartViewportWidth = Math.min(rawViewportWidth, Math.max(280, baseContentWidth - 120));
  const chartMaxValue = maxUsage <= 0 ? 1 : Math.ceil(maxUsage * 1.22);
  const hasData = rows.some((row) => row.totalUsage > 0 || row.chlorineUsage > 0 || row.peroxideUsage > 0);
  const zoomPercent = Math.round(zoomLevel * 100);
  const canZoomOut = zoomLevel > MIN_CHART_ZOOM;
  const canZoomIn = zoomLevel < MAX_CHART_ZOOM;
  const segmentValueFontSize = zoomLevel >= 1.35 ? 8 : 7;
  const totalLabelWidth = Math.round(Math.max(56, Math.min(82, barWidth + 34)));
  const totalValueFontSize = zoomLevel >= 1.35 ? 9 : 8;
  const totalLabelContainerStyle = {
    width: totalLabelWidth,
    height: 18,
    left: (barWidth - totalLabelWidth) / 2,
    justifyContent: 'center',
    alignItems: 'center',
  };
  const renderChemicalTotalLabel = (value) =>
    value > 0 ? (
      <View style={styles.chartPlainValueWrap}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.chartPlainValueText, { fontSize: totalValueFontSize }]}>
          {formatNumber(value, 2)}
        </Text>
      </View>
    ) : null;
  const renderChemicalStackValue = (value, textColor) =>
    value > 0 ? (
      <View style={styles.stackValueWrap}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[
            styles.stackValueText,
            {
              color: textColor,
              fontSize: segmentValueFontSize,
              textShadowColor: textColor === '#FFFFFF' ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.42)',
            },
          ]}
        >
          {formatNumber(value, 2)}
        </Text>
      </View>
    ) : null;
  const createChemicalStack = ({ value, color, textColor, isBottom, isTop }) => ({
    value,
    color,
    borderBottomLeftRadius: isBottom ? 5 : 0,
    borderBottomRightRadius: isBottom ? 5 : 0,
    borderTopLeftRadius: isTop ? 5 : 0,
    borderTopRightRadius: isTop ? 5 : 0,
    innerBarComponent: () => renderChemicalStackValue(value, textColor),
  });
  const updateZoom = (change) => {
    setZoomLevel((currentZoom) => {
      const nextZoom = currentZoom + change;
      return Math.min(MAX_CHART_ZOOM, Math.max(MIN_CHART_ZOOM, Number(nextZoom.toFixed(2))));
    });
  };
  const chartData = rows.map((row) => {
    const chlorineUsage = Math.max(0, row.chlorineUsage || 0);
    const peroxideUsage = Math.max(0, row.peroxideUsage || 0);
    const totalMonthUsage = Math.max(0, row.totalUsage || chlorineUsage + peroxideUsage);
    const chemicalStacks = [
      { key: 'chlorine', value: chlorineUsage, color: chlorineColor, textColor: '#FFFFFF' },
      { key: 'peroxide', value: peroxideUsage, color: peroxideColor, textColor: '#11233B' },
    ];

    return {
      label: row.label,
      onPress: () =>
        setSelectedBar({
          title: row.label,
          totalLabel: 'Total',
          totalValue: totalMonthUsage,
          items: [
            { label: 'Chlorine', value: chlorineUsage, color: chlorineColor, iconName: 'water-outline' },
            { label: 'Peroxide', value: peroxideUsage, color: peroxideColor, iconName: 'flask-outline' },
          ],
        }),
      topLabelContainerStyle: totalLabelContainerStyle,
      topLabelComponent: () => renderChemicalTotalLabel(totalMonthUsage),
      stacks: chemicalStacks.map((stack, index) =>
        createChemicalStack({
          ...stack,
          isBottom: index === 0,
          isTop: index === chemicalStacks.length - 1,
        })
      ),
    };
  });

  return (
    <Card style={[styles.panelCard, cardStyle]}>
      <SectionHeader
        title="Monthly Chemical Usage"
        iconName="flask-outline"
        iconColor={palette.teal600}
        styles={styles}
      />

      <View style={[styles.chartMetaRow, !isWide && styles.chartMetaRowCompact]}>
        <View style={styles.chemicalSummaryTotals}>
          <View style={[styles.productionSummaryPill, styles.chemicalSummaryPill]}>
            <View style={[styles.productionSummaryAccent, styles.chemicalSummaryAccentChlorine]} />
            <View style={[styles.productionSummaryIcon, styles.chemicalSummaryIconChlorine]}>
              <Ionicons name="water-outline" size={15} color={chlorineColor} />
            </View>
            <View style={styles.productionSummaryCopy}>
              <Text style={styles.productionSummaryLabel}>Total Chlorine</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
                style={[styles.productionSummaryValue, styles.chemicalSummaryValue]}
              >
                {formatNumber(totalChlorine)}
              </Text>
              <Text style={styles.productionSummaryHint}>Latest 10 months</Text>
            </View>
          </View>

          <View style={[styles.productionSummaryPill, styles.chemicalSummaryPill]}>
            <View style={[styles.productionSummaryAccent, styles.chemicalSummaryAccentPeroxide]} />
            <View style={[styles.productionSummaryIcon, styles.chemicalSummaryIconPeroxide]}>
              <Ionicons name="flask-outline" size={15} color={peroxideColor} />
            </View>
            <View style={styles.productionSummaryCopy}>
              <Text style={styles.productionSummaryLabel}>Total Peroxide</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
                style={[styles.productionSummaryValue, styles.chemicalSummaryValue]}
              >
                {formatNumber(totalPeroxide)}
              </Text>
              <Text style={styles.productionSummaryHint}>Latest 10 months</Text>
            </View>
          </View>
        </View>

        <View style={[styles.chartToolbar, !isWide && styles.chartToolbarCompact]}>
          <Text style={styles.chartToolbarLabel}>Zoom</Text>
          <View style={styles.zoomControls}>
            <Pressable
              onPress={() => updateZoom(-CHART_ZOOM_STEP)}
              disabled={!canZoomOut}
              accessibilityLabel="Zoom out chemical usage chart"
              style={({ pressed }) => [
                styles.zoomButton,
                pressed && canZoomOut ? styles.pressed : null,
                !canZoomOut ? styles.zoomButtonDisabled : null,
              ]}
            >
              <Ionicons name="remove" size={15} color={palette.ink900} />
            </Pressable>
            <Pressable
              onPress={() => setZoomLevel(1)}
              disabled={zoomLevel === 1}
              accessibilityLabel="Reset chemical usage chart zoom"
              style={({ pressed }) => [
                styles.zoomValueButton,
                pressed && zoomLevel !== 1 ? styles.pressed : null,
                zoomLevel === 1 ? styles.zoomValueButtonDisabled : null,
              ]}
            >
              <Ionicons name="resize-outline" size={14} color={palette.ink900} />
              <Text style={styles.zoomValueText}>{zoomPercent}%</Text>
            </Pressable>
            <Pressable
              onPress={() => updateZoom(CHART_ZOOM_STEP)}
              disabled={!canZoomIn}
              accessibilityLabel="Zoom in chemical usage chart"
              style={({ pressed }) => [
                styles.zoomButton,
                pressed && canZoomIn ? styles.pressed : null,
                !canZoomIn ? styles.zoomButtonDisabled : null,
              ]}
            >
              <Ionicons name="add" size={15} color={palette.ink900} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={[styles.productionChart, styles.chemicalUsageChart]}>
        <BarChart
          stackData={chartData}
          width={chartViewportWidth}
          height={chartHeight}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={18}
          endSpacing={18}
          maxValue={chartMaxValue}
          noOfSections={5}
          roundedTop
          roundedBottom={false}
          isAnimated
          animationDuration={800}
          xAxisColor={palette.lineStrong}
          yAxisColor={palette.lineStrong}
          rulesColor={palette.line}
          rulesThickness={1}
          yAxisTextStyle={styles.chartAxisLabel}
          xAxisLabelTextStyle={styles.chartMonthLabel}
          yAxisLabelWidth={58}
          xAxisTextNumberOfLines={1}
          labelsExtraHeight={28}
          formatYLabel={(value) => formatNumber(value, 0)}
          disableScroll={false}
          nestedScrollEnabled
          showScrollIndicator
          indicatorColor={isDark ? 'white' : 'black'}
        />
      </View>

      <ChartValueDetails selected={selectedBar} styles={styles} />

      <View style={styles.productionLegendRow}>
        <View style={styles.productionLegendItem}>
          <Ionicons name="water-outline" size={13} color={chlorineColor} />
          <View style={[styles.productionLegendSwatch, styles.chemicalLegendChlorine]} />
          <Text style={styles.productionLegendText}>Chlorine</Text>
        </View>
        <View style={styles.productionLegendItem}>
          <Ionicons name="flask-outline" size={13} color={peroxideColor} />
          <View style={[styles.productionLegendSwatch, styles.chemicalLegendPeroxide]} />
          <Text style={styles.productionLegendText}>Peroxide</Text>
        </View>
      </View>

      {!hasData ? (
        <MessageBanner tone="info">Monthly chemical usage will appear here after chlorine and peroxide values are saved.</MessageBanner>
      ) : null}
    </Card>
  );
}

function DailyProductionCard({ dailyProduction, palette, isDark, isWide, screenWidth, styles, cardStyle }) {
  const rows = dailyProduction?.rows ?? [];
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedBar, setSelectedBar] = useState(null);
  const totalProduction =
    dailyProduction?.totalProduction ??
    rows.reduce((sum, row) => sum + (Number(row.production) || 0), 0);
  const maxVolume = Math.max(
    ...rows.map((row) => row.production || 0),
    1
  );
  const chartHeight = isWide ? 300 : 250;
  const baseBarWidth = isWide ? 18 : 16;
  const baseSpacing = isWide ? 18 : 14;
  const barWidth = Math.round(baseBarWidth * zoomLevel);
  const spacing = Math.round(baseSpacing * zoomLevel);
  const rawViewportWidth = Math.max(280, screenWidth - (isWide ? 120 : 72));
  const baseContentWidth = Math.max(rows.length * (baseBarWidth + baseSpacing) + 90, isWide ? 920 : 640);
  const chartViewportWidth = Math.min(rawViewportWidth, Math.max(280, baseContentWidth - 120));
  const chartMaxValue = maxVolume <= 0 ? 1 : Math.ceil(maxVolume * 1.18);
  const hasData = rows.some((row) => row.production > 0);
  const zoomPercent = Math.round(zoomLevel * 100);
  const canZoomOut = zoomLevel > MIN_CHART_ZOOM;
  const canZoomIn = zoomLevel < MAX_CHART_ZOOM;
  const valueLabelWidth = Math.round(Math.max(46, Math.min(64, barWidth + 34)));
  const valueLabelFontSize = zoomLevel >= 1.4 ? 8 : 7;
  const topLabelContainerStyle = {
    width: valueLabelWidth,
    height: 16,
    left: (barWidth - valueLabelWidth) / 2,
    justifyContent: 'center',
    alignItems: 'center',
  };
  const updateZoom = (change) => {
    setZoomLevel((currentZoom) => {
      const nextZoom = currentZoom + change;
      return Math.min(MAX_CHART_ZOOM, Math.max(MIN_CHART_ZOOM, Number(nextZoom.toFixed(2))));
    });
  };
  const chartData = rows.map((row) => {
    const production = Math.max(0, row.production || 0);
    const productionColor = isDark ? '#1D7896' : '#176A87';

    return {
      value: production,
      label: row.label,
      frontColor: productionColor,
      gradientColor: isDark ? '#36B7D3' : '#4FC3DF',
      onPress: () =>
        setSelectedBar({
          title: row.label,
          items: [{ label: 'Production', value: production, color: productionColor }],
        }),
      topLabelContainerStyle,
      topLabelComponent: () =>
        row.production > 0 ? (
          <View style={styles.chartPlainValueWrap}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.chartPlainValueText, styles.dailyChartPlainValueText, { fontSize: valueLabelFontSize }]}>
              {formatNumber(row.production, 2)}
            </Text>
          </View>
        ) : null,
    };
  });

  return (
    <Card style={[styles.panelCard, cardStyle]}>
      <SectionHeader
        title="Daily Production"
        iconName="stats-chart-outline"
        iconColor={palette.teal600}
        styles={styles}
      />

      <View style={[styles.chartMetaRow, !isWide && styles.chartMetaRowCompact]}>
        <View style={[styles.productionSummaryPill, isWide && styles.productionSummaryPillWide]}>
          <View style={styles.productionSummaryAccent} />
          <View style={styles.productionSummaryIcon}>
            <Ionicons name="calendar-outline" size={15} color={palette.teal600} />
          </View>
          <View style={styles.productionSummaryCopy}>
            <Text style={styles.productionSummaryLabel}>Month Total</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.productionSummaryValue}>
              {formatNumber(totalProduction)}
            </Text>
            <Text style={styles.productionSummaryHint}>{dailyProduction?.monthLabel || 'Current month'}</Text>
          </View>
        </View>

        <View style={[styles.chartToolbar, !isWide && styles.chartToolbarCompact]}>
          <Text style={styles.chartToolbarLabel}>Zoom</Text>
          <View style={styles.zoomControls}>
            <Pressable
              onPress={() => updateZoom(-CHART_ZOOM_STEP)}
              disabled={!canZoomOut}
              accessibilityLabel="Zoom out daily chart"
              style={({ pressed }) => [
                styles.zoomButton,
                pressed && canZoomOut ? styles.pressed : null,
                !canZoomOut ? styles.zoomButtonDisabled : null,
              ]}
            >
              <Ionicons name="remove" size={15} color={palette.ink900} />
            </Pressable>
            <Pressable
              onPress={() => setZoomLevel(1)}
              disabled={zoomLevel === 1}
              accessibilityLabel="Reset daily chart zoom"
              style={({ pressed }) => [
                styles.zoomValueButton,
                pressed && zoomLevel !== 1 ? styles.pressed : null,
                zoomLevel === 1 ? styles.zoomValueButtonDisabled : null,
              ]}
            >
              <Ionicons name="resize-outline" size={14} color={palette.ink900} />
              <Text style={styles.zoomValueText}>{zoomPercent}%</Text>
            </Pressable>
            <Pressable
              onPress={() => updateZoom(CHART_ZOOM_STEP)}
              disabled={!canZoomIn}
              accessibilityLabel="Zoom in daily chart"
              style={({ pressed }) => [
                styles.zoomButton,
                pressed && canZoomIn ? styles.pressed : null,
                !canZoomIn ? styles.zoomButtonDisabled : null,
              ]}
            >
              <Ionicons name="add" size={15} color={palette.ink900} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.dailyChartTitleWrap}>
        <Text style={styles.dailyChartTitle}>{dailyProduction?.monthLabel || 'Current Month'} Production</Text>
      </View>

      <View style={[styles.productionChart, styles.dailyProductionChart]}>
        <BarChart
          data={chartData}
          width={chartViewportWidth}
          height={chartHeight}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={18}
          endSpacing={18}
          maxValue={chartMaxValue}
          noOfSections={5}
          showGradient
          roundedBottom={false}
          barBorderTopLeftRadius={5}
          barBorderTopRightRadius={5}
          barBorderBottomLeftRadius={0}
          barBorderBottomRightRadius={0}
          isAnimated
          animationDuration={800}
          showValuesAsTopLabel={false}
          xAxisColor={palette.lineStrong}
          yAxisColor={palette.lineStrong}
          rulesColor={palette.line}
          rulesThickness={1}
          yAxisTextStyle={styles.chartAxisLabel}
          xAxisLabelTextStyle={styles.dailyChartDayLabel}
          yAxisLabelWidth={56}
          xAxisTextNumberOfLines={1}
          labelsExtraHeight={52}
          labelsDistanceFromXaxis={8}
          rotateLabel
          formatYLabel={(value) => formatNumber(value, 0)}
          disableScroll={false}
          nestedScrollEnabled
          showScrollIndicator
          indicatorColor={isDark ? 'white' : 'black'}
        />
      </View>

      <ChartValueDetails selected={selectedBar} styles={styles} />

      <View style={styles.productionLegendRow}>
        <View style={styles.productionLegendItem}>
          <View style={[styles.productionLegendSwatch, styles.productionLegendProduction]} />
          <Text style={styles.productionLegendText}>Production</Text>
        </View>
      </View>

      {!hasData ? (
        <MessageBanner tone="info">Daily production will appear here after current-month totalizer values are saved.</MessageBanner>
      ) : null}
    </Card>
  );
}

export default function OfficeGraphsScreen({ navigation }) {
  const { palette, isDark } = useTheme();
  const { profile } = useAuth();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const useTwoColumnCharts = width >= 980;
  const chartCardWidth = useTwoColumnCharts ? Math.floor((width - 44) / 2) : width;
  const [monthlyProduction, setMonthlyProduction] = useState({
    totalProduction: 0,
    averageProduction: 0,
    rows: [],
  });
  const [monthlyPowerConsumption, setMonthlyPowerConsumption] = useState({
    totalPower: 0,
    rows: [],
  });
  const [monthlyChemicalUsage, setMonthlyChemicalUsage] = useState({
    totalChlorine: 0,
    totalPeroxide: 0,
    rows: [],
  });
  const [dailyProduction, setDailyProduction] = useState({
    monthLabel: '',
    totalProduction: 0,
    rows: [],
  });
  const [loading, setLoading] = useState(true);
  const [exportingFormat, setExportingFormat] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('info');
  const canExportAnalytics = profile?.role === 'manager' || profile?.role === 'supervisor';

  async function loadGraphs({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
    }

    try {
      const snapshot = await getOfficeDashboardSnapshot();
      setMonthlyProduction(snapshot.monthlyProduction);
      setDailyProduction(snapshot.dailyProduction || { monthLabel: '', totalProduction: 0, rows: [] });
      setMonthlyChemicalUsage(snapshot.monthlyChemicalUsage || { totalChlorine: 0, totalPeroxide: 0, rows: [] });
      setMonthlyPowerConsumption(snapshot.monthlyPowerConsumption || { totalPower: 0, rows: [] });
      setTone('success');
      setMessage('Dashboard graphs are synced with the live database.');
    } catch (error) {
      setTone('error');
      setMessage(error.message || 'Failed to load dashboard graphs.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadGraphs();
  }, []);

  async function handleExportAnalytics(format) {
    if (!canExportAnalytics) {
      setTone('error');
      setMessage('Only managers and supervisors can export analytics.');
      return;
    }

    const sections = buildAnalyticsExportSections({
      monthlyProduction,
      monthlyPowerConsumption,
      monthlyChemicalUsage,
    });
    const hasRows = sections.some((section) => section.title !== 'Summary' && section.rows.length);

    if (!hasRows) {
      setTone('info');
      setMessage('Load monthly analytics data before exporting.');
      return;
    }

    setExportingFormat(format);
    setTone('info');
    setMessage(`Preparing ${format.toUpperCase()} export...`);

    try {
      let exportResult = null;

      if (format === 'xlsx') {
        const workbook = XLSX.utils.book_new();
        sections.forEach((section) => {
          const worksheet = XLSX.utils.aoa_to_sheet(buildSheetRows(section.columns, section.rows));
          XLSX.utils.book_append_sheet(workbook, worksheet, section.sheetName);
        });

        const fileName = buildExportFileName('xlsx');

        if (Platform.OS === 'web') {
          const workbookArray = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob(
            [workbookArray],
            { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
          );
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', fileName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } else {
          exportResult = await saveNativeExportFile({
            fileName,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Export monthly analytics Excel file',
            uti: 'org.openxmlformats.spreadsheetml.sheet',
            base64Content: XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }),
            shareMessage: 'Monthly analytics Excel export is ready.',
          });
        }
      } else {
        const fileName = buildExportFileName('pdf');
        const html = buildAnalyticsPdfDocument(sections);

        if (Platform.OS === 'web') {
          const printWindow = window.open('', '_blank');

          if (!printWindow) {
            throw new Error('Unable to open a print window for PDF export.');
          }

          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        } else {
          const { uri: fileUri } = await Print.printToFileAsync({
            html,
            base64: false,
          });

          exportResult = await saveNativeExportFile({
            fileName,
            mimeType: 'application/pdf',
            dialogTitle: 'Export monthly analytics PDF',
            uti: 'com.adobe.pdf',
            localUri: fileUri,
            shareMessage: 'Monthly analytics PDF export is ready.',
          });
        }
      }

      setTone('success');
      setMessage(buildNativeExportSuccessMessage(format, exportResult));
    } catch (error) {
      setTone('error');
      setMessage(error.message || `Failed to export ${format.toUpperCase()}.`);
    } finally {
      setExportingFormat('');
    }
  }

  return (
    <ScreenShell
      eyebrow="Office analytics"
      title="Manager dashboard"
      subtitle="Production, power, and field activity for supervisor and manager review."
    >
      <View style={styles.topPillRow}>
        <Pressable
          onPress={() => navigation.navigate('office-dashboard')}
          style={({ pressed }) => [styles.backPill, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={13} color={palette.ink900} />
          <Text style={styles.backPillText}>Back to dashboard</Text>
        </Pressable>

        <Pressable
          onPress={() => loadGraphs()}
          disabled={loading || Boolean(exportingFormat)}
          style={({ pressed }) => [
            styles.refreshPill,
            pressed && !loading && !exportingFormat ? styles.pressed : null,
            loading || exportingFormat ? styles.disabledPill : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={palette.ink900} />
          ) : (
            <Ionicons name="refresh" size={13} color={palette.ink900} />
          )}
          <Text style={styles.refreshPillText}>Refresh graphs</Text>
        </Pressable>
      </View>

      {canExportAnalytics ? (
        <View style={styles.exportActionRow}>
          <Pressable
            onPress={() => handleExportAnalytics('pdf')}
            disabled={loading || Boolean(exportingFormat)}
            style={({ pressed }) => [
              styles.exportPill,
              pressed && !loading && !exportingFormat ? styles.pressed : null,
              loading || exportingFormat ? styles.disabledPill : null,
            ]}
          >
            {exportingFormat === 'pdf' ? (
              <ActivityIndicator size="small" color={palette.ink900} />
            ) : (
              <Ionicons name="document-attach-outline" size={13} color={palette.ink900} />
            )}
            <Text style={styles.exportPillText}>{exportingFormat === 'pdf' ? 'Exporting PDF...' : 'Export PDF'}</Text>
          </Pressable>

          <Pressable
            onPress={() => handleExportAnalytics('xlsx')}
            disabled={loading || Boolean(exportingFormat)}
            style={({ pressed }) => [
              styles.exportPill,
              pressed && !loading && !exportingFormat ? styles.pressed : null,
              loading || exportingFormat ? styles.disabledPill : null,
            ]}
          >
            {exportingFormat === 'xlsx' ? (
              <ActivityIndicator size="small" color={palette.ink900} />
            ) : (
              <Ionicons name="grid-outline" size={13} color={palette.ink900} />
            )}
            <Text style={styles.exportPillText}>{exportingFormat === 'xlsx' ? 'Exporting Excel...' : 'Export Excel'}</Text>
          </Pressable>
        </View>
      ) : null}

      {message ? <MessageBanner tone={tone}>{message}</MessageBanner> : null}

      {loading ? (
        <GraphSkeletonGrid styles={styles} useTwoColumnCharts={useTwoColumnCharts} />
      ) : (
        <View style={styles.chartGrid}>
          <MonthlyProductionCard
            monthlyProduction={monthlyProduction}
            palette={palette}
            isDark={isDark}
            isWide={isWide}
            screenWidth={chartCardWidth}
            styles={styles}
            cardStyle={useTwoColumnCharts ? styles.chartGridCard : null}
          />
          <DailyProductionCard
            dailyProduction={dailyProduction}
            palette={palette}
            isDark={isDark}
            isWide={isWide}
            screenWidth={chartCardWidth}
            styles={styles}
            cardStyle={useTwoColumnCharts ? styles.chartGridCard : null}
          />
          <MonthlyPowerConsumptionCard
            monthlyPowerConsumption={monthlyPowerConsumption}
            palette={palette}
            isDark={isDark}
            isWide={isWide}
            screenWidth={chartCardWidth}
            styles={styles}
            cardStyle={useTwoColumnCharts ? styles.chartGridCard : null}
          />
          <MonthlyChemicalUsageCard
            monthlyChemicalUsage={monthlyChemicalUsage}
            palette={palette}
            isDark={isDark}
            isWide={isWide}
            screenWidth={chartCardWidth}
            styles={styles}
            cardStyle={useTwoColumnCharts ? styles.chartGridCard : null}
          />
        </View>
      )}
    </ScreenShell>
  );
}

function createStyles(palette, isDark) {
  return StyleSheet.create({
    topPillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    backPill: {
      alignSelf: 'flex-start',
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? palette.mist : '#F7FBFF',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    backPillText: {
      color: palette.ink900,
      fontSize: 10,
      fontWeight: '800',
    },
    refreshPill: {
      alignSelf: 'flex-end',
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: isDark ? '#1A655E' : '#B4E5DE',
      backgroundColor: isDark ? '#11312D' : '#E5F5F3',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    refreshPillText: {
      color: palette.ink900,
      fontSize: 10,
      fontWeight: '800',
    },
    exportActionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
    },
    exportPill: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    exportPillText: {
      color: palette.ink900,
      fontSize: 10,
      fontWeight: '800',
    },
    disabledPill: {
      opacity: 0.65,
    },
    pressed: {
      transform: [{ scale: 0.98 }],
    },
    loadingWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    chartGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'stretch',
    },
    chartGridCard: {
      flexBasis: '48%',
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    panelCard: {
      gap: 12,
      padding: 12,
    },
    skeletonBlock: {
      backgroundColor: isDark ? '#1C3346' : '#E5EEF6',
      borderRadius: 8,
    },
    skeletonHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    skeletonIcon: {
      width: 24,
      height: 24,
      borderRadius: 999,
    },
    skeletonTitleLine: {
      width: 170,
      maxWidth: '72%',
      height: 16,
    },
    skeletonMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      gap: 8,
    },
    skeletonSummaryPill: {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 170,
      height: 54,
    },
    skeletonToolbarPill: {
      width: 150,
      height: 54,
    },
    skeletonChartArea: {
      minHeight: 292,
      flexDirection: 'row',
      gap: 10,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#0B1723' : '#FBFDFF',
      paddingHorizontal: 12,
      paddingTop: 24,
      paddingBottom: 16,
      borderRadius: 8,
    },
    skeletonChartAreaTall: {
      minHeight: 360,
    },
    skeletonAxisColumn: {
      width: 36,
      justifyContent: 'space-between',
      paddingBottom: 28,
    },
    skeletonAxisTick: {
      width: 28,
      height: 8,
      borderRadius: 4,
    },
    skeletonBarsRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 8,
    },
    skeletonBarSlot: {
      flex: 1,
      minWidth: 12,
      maxWidth: 34,
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
    },
    skeletonBar: {
      width: '100%',
      maxWidth: 26,
      borderRadius: 5,
    },
    skeletonBarSegmentTop: {
      width: '100%',
      maxWidth: 26,
      borderTopLeftRadius: 5,
      borderTopRightRadius: 5,
      borderBottomLeftRadius: 2,
      borderBottomRightRadius: 2,
    },
    skeletonBarSegmentBottom: {
      width: '100%',
      maxWidth: 26,
      borderTopLeftRadius: 2,
      borderTopRightRadius: 2,
      borderBottomLeftRadius: 5,
      borderBottomRightRadius: 5,
    },
    skeletonBarLabel: {
      width: '80%',
      height: 8,
      borderRadius: 4,
    },
    skeletonLegendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 10,
    },
    skeletonLegendItem: {
      width: 104,
      height: 18,
      borderRadius: 8,
    },
    sectionHeader: {
      gap: 3,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderWidth: 1,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
    },
    sectionTitle: {
      color: palette.ink900,
      fontSize: 16,
      fontWeight: '800',
    },
    sectionBody: {
      color: palette.ink700,
      fontSize: 12,
      lineHeight: 16,
    },
    chartMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      gap: 8,
    },
    chartMetaRowCompact: {
      flexDirection: 'column',
    },
    chemicalSummaryTotals: {
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      minWidth: 0,
    },
    chemicalSummaryTotalsCompact: {
      width: '100%',
      flexDirection: 'column',
    },
    productionSummaryPill: {
      position: 'relative',
      overflow: 'hidden',
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 0,
      flexGrow: 1,
      flexShrink: 1,
      borderWidth: 1,
      borderColor: isDark ? '#1E5B61' : '#B7E2E4',
      backgroundColor: isDark ? '#122334' : '#F2FCFC',
      paddingLeft: 16,
      paddingRight: 14,
      paddingVertical: 12,
      borderRadius: 8,
      shadowColor: isDark ? '#000000' : '#0F766E',
      shadowOpacity: isDark ? 0.22 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    productionSummaryPillWide: {
      maxWidth: 360,
    },
    chemicalSummaryPill: {
      flex: 1,
      maxWidth: undefined,
      gap: 7,
      paddingLeft: 12,
      paddingRight: 8,
    },
    chemicalSummaryValue: {
      minWidth: 0,
      flexShrink: 1,
    },
    productionSummaryAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 5,
      backgroundColor: palette.teal600,
    },
    chemicalSummaryAccentChlorine: {
      backgroundColor: isDark ? '#34BFA3' : '#0F8F7C',
    },
    chemicalSummaryAccentPeroxide: {
      backgroundColor: isDark ? '#F6C85F' : '#E7A321',
    },
    productionSummaryIcon: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#26786F' : '#9ADBD5',
      backgroundColor: isDark ? '#0E3A37' : '#DDF7F4',
      borderRadius: 8,
    },
    chemicalSummaryIconChlorine: {
      borderColor: isDark ? '#26786F' : '#9ADBD5',
      backgroundColor: isDark ? '#0E3A37' : '#DDF7F4',
    },
    chemicalSummaryIconPeroxide: {
      borderColor: isDark ? '#8F6B1A' : '#F4D78A',
      backgroundColor: isDark ? '#3B2D12' : '#FFF7DF',
    },
    productionSummaryCopy: {
      flex: 1,
      minWidth: 0,
    },
    productionSummaryLabel: {
      color: palette.ink700,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    productionSummaryValue: {
      marginTop: 2,
      color: isDark ? palette.ink900 : palette.navy900,
      fontSize: 22,
      fontWeight: '900',
      lineHeight: 26,
    },
    productionSummaryHint: {
      marginTop: 1,
      color: palette.ink500,
      fontSize: 9,
      fontWeight: '800',
    },
    chartToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      minHeight: 54,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#101D2A' : '#F9FCFF',
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 8,
    },
    chartToolbarCompact: {
      width: '100%',
    },
    chartToolbarLabel: {
      color: palette.ink700,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    zoomControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    zoomButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#152636' : '#F7FBFF',
      borderRadius: 8,
    },
    zoomButtonDisabled: {
      opacity: 0.45,
    },
    zoomValueButton: {
      minWidth: 74,
      height: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: isDark ? '#1A655E' : '#B4E5DE',
      backgroundColor: isDark ? '#11312D' : '#E5F5F3',
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    zoomValueButtonDisabled: {
      opacity: 0.85,
    },
    zoomValueText: {
      color: palette.ink900,
      fontSize: 10,
      fontWeight: '900',
    },
    productionChart: {
      overflow: 'hidden',
      minHeight: 292,
      paddingTop: 20,
      paddingRight: 10,
      paddingBottom: 6,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#0B1723' : '#FBFDFF',
      borderRadius: 8,
    },
    dailyChartTitleWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 2,
    },
    dailyChartTitle: {
      color: palette.ink900,
      fontSize: 15,
      fontWeight: '900',
      textAlign: 'center',
    },
    dailyProductionChart: {
      minHeight: 360,
      paddingTop: 22,
      paddingBottom: 10,
    },
    chartValueDetails: {
      gap: 8,
      borderWidth: 1,
      borderColor: isDark ? '#21475A' : '#CDE6EF',
      backgroundColor: isDark ? '#0F2230' : '#F4FBFE',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
    },
    chartValueDetailsCompact: {
      alignSelf: 'center',
      minWidth: 160,
      maxWidth: 260,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    chartValueDetailsSplitCompact: {
      alignSelf: 'center',
      minWidth: 180,
      maxWidth: '92%',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    chartValueDetailsHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    chartValueDetailsHeaderCompact: {
      flex: 1,
      minWidth: 0,
    },
    chartValueDetailsHeaderSplitCompact: {
      paddingHorizontal: 2,
      justifyContent: 'center',
    },
    chartValueDetailsTitle: {
      color: palette.ink900,
      fontSize: 12,
      fontWeight: '900',
      textAlign: 'center',
    },
    chartValueDetailsTotal: {
      alignSelf: 'center',
      minWidth: 120,
      color: palette.ink700,
      fontSize: 11,
      fontWeight: '900',
      textAlign: 'center',
    },
    chartValueDetailsRowSplitCompact: {
      flexDirection: 'column',
      alignItems: 'center',
      flexWrap: 'nowrap',
      justifyContent: 'center',
      gap: 4,
    },
    chartValueDetailsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
    },
    chartValueDetailsRowCompact: {
      flexShrink: 0,
    },
    chartValueDetailsItem: {
      minHeight: 30,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#132A3A' : '#FFFFFF',
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 8,
    },
    chartValueDetailsItemCompact: {
      minHeight: 28,
      paddingHorizontal: 7,
      paddingVertical: 5,
    },
    chartValueDetailsItemSplitCompact: {
      alignSelf: 'center',
      minWidth: 150,
      maxWidth: '100%',
      justifyContent: 'center',
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    chartValueDetailsDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
    },
    chartValueDetailsLabel: {
      color: palette.ink700,
      fontSize: 10,
      fontWeight: '800',
    },
    chartValueDetailsValue: {
      minWidth: 0,
      color: palette.ink900,
      fontSize: 11,
      fontWeight: '900',
    },
    chemicalChartPanel: {
      gap: 8,
    },
    chemicalChartTitleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    chemicalChartTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chemicalChartTitle: {
      color: palette.ink900,
      fontSize: 13,
      fontWeight: '900',
    },
    chemicalUsageChart: {
      minHeight: 258,
    },
    chartAxisLabel: {
      color: palette.ink500,
      fontSize: 9,
      fontWeight: '800',
    },
    chartMonthLabel: {
      color: palette.ink700,
      fontSize: 9,
      fontWeight: '800',
    },
    dailyChartDayLabel: {
      color: palette.ink700,
      fontSize: 8,
      fontWeight: '800',
    },
    chartPlainValueWrap: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartPlainValueText: {
      color: isDark ? palette.ink900 : palette.navy900,
      fontWeight: '900',
      lineHeight: 12,
      textAlign: 'center',
      textShadowColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.9)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    dailyChartPlainValueText: {
      color: isDark ? '#D9F8FF' : '#0A3344',
      lineHeight: 10,
    },
    stackValueWrap: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    stackValueText: {
      color: '#FFFFFF',
      fontWeight: '900',
      lineHeight: 9,
      textAlign: 'center',
      textShadowColor: 'rgba(0,0,0,0.28)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    productionLegendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    productionLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    productionLegendSwatch: {
      width: 18,
      height: 7,
      borderWidth: 1,
      borderColor: palette.lineStrong,
    },
    productionLegendProduction: {
      backgroundColor: isDark ? '#2CB4DB' : '#1598C6',
    },
    powerLegendChlorination: {
      backgroundColor: isDark ? palette.teal500 : palette.teal600,
    },
    powerLegendDeepwell: {
      backgroundColor: palette.amber500,
    },
    chemicalLegendChlorine: {
      backgroundColor: isDark ? '#34BFA3' : '#0F8F7C',
    },
    chemicalLegendPeroxide: {
      backgroundColor: isDark ? '#F6C85F' : '#E7A321',
    },
    productionLegendText: {
      color: palette.ink700,
      fontSize: 9,
      fontWeight: '800',
    },
  });
}
