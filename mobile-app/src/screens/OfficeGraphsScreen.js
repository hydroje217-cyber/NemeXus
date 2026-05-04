import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BarChart } from 'react-native-gifted-charts';
import Card from '../components/Card';
import MessageBanner from '../components/MessageBanner';
import ScreenShell from '../components/ScreenShell';
import { useTheme } from '../context/ThemeContext';
import { getOfficeDashboardSnapshot } from '../services/office';

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

const MIN_CHART_ZOOM = 0.75;
const MAX_CHART_ZOOM = 2;
const CHART_ZOOM_STEP = 0.25;

function MonthlyProductionCard({ monthlyProduction, palette, isDark, isWide, screenWidth, styles, cardStyle }) {
  const rows = monthlyProduction?.rows ?? [];
  const [zoomLevel, setZoomLevel] = useState(1);
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
  const chartData = rows.map((row) => ({
    value: Math.max(0, row.production || 0),
    label: row.label,
    frontColor: palette.teal600,
    gradientColor: palette.cyan300,
    topLabelContainerStyle,
    topLabelComponent: () =>
      row.production > 0 ? (
        <View style={styles.chartPlainValueWrap}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.chartPlainValueText, { fontSize: valueLabelFontSize }]}>
            {formatNumber(row.production, 2)}
          </Text>
        </View>
      ) : null,
  }));

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
          roundedTop
          roundedBottom={false}
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
          disablePress
        />
      </View>

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
          disablePress
        />
      </View>

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

function DailyProductionCard({ dailyProduction, palette, isDark, isWide, screenWidth, styles, cardStyle }) {
  const rows = dailyProduction?.rows ?? [];
  const [zoomLevel, setZoomLevel] = useState(1);
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
  const chartData = rows.map((row) => ({
    value: Math.max(0, row.production || 0),
    label: row.label,
    frontColor: isDark ? '#1D7896' : '#176A87',
    gradientColor: isDark ? '#36B7D3' : '#4FC3DF',
    topLabelContainerStyle,
    topLabelComponent: () =>
      row.production > 0 ? (
        <View style={styles.chartPlainValueWrap}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.chartPlainValueText, styles.dailyChartPlainValueText, { fontSize: valueLabelFontSize }]}>
            {formatNumber(row.production, 2)}
          </Text>
        </View>
      ) : null,
  }));

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
          roundedTop
          roundedBottom={false}
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
          disablePress
        />
      </View>

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
  const [dailyProduction, setDailyProduction] = useState({
    monthLabel: '',
    totalProduction: 0,
    rows: [],
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('info');

  async function loadGraphs({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
    }

    try {
      const snapshot = await getOfficeDashboardSnapshot();
      setMonthlyProduction(snapshot.monthlyProduction);
      setDailyProduction(snapshot.dailyProduction || { monthLabel: '', totalProduction: 0, rows: [] });
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
          disabled={loading}
          style={({ pressed }) => [
            styles.refreshPill,
            pressed && !loading ? styles.pressed : null,
            loading ? styles.disabledPill : null,
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

      {message ? <MessageBanner tone={tone}>{message}</MessageBanner> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={palette.teal600} />
        </View>
      ) : (
        <View style={styles.chartGrid}>
          <MonthlyPowerConsumptionCard
            monthlyPowerConsumption={monthlyPowerConsumption}
            palette={palette}
            isDark={isDark}
            isWide={isWide}
            screenWidth={chartCardWidth}
            styles={styles}
            cardStyle={useTwoColumnCharts ? styles.chartGridCard : null}
          />
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
    productionSummaryAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 5,
      backgroundColor: palette.teal600,
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
    productionLegendText: {
      color: palette.ink700,
      fontSize: 9,
      fontWeight: '800',
    },
  });
}
