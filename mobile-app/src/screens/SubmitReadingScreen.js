import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Card from '../components/Card';
import FormField from '../components/FormField';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  enqueueOfflineReading,
  getOfflineReadingCount,
  isLikelyOfflineError,
  syncOfflineReadings,
} from '../services/offlineReadings';
import { createReading } from '../services/readings';
import { parseNullableNumber } from '../utils/readings';
import { isShiftBatchEntryWindow, nextShiftBatchEntryText, shiftNameForSlot } from '../utils/shiftSchedule';
import { formatTimestamp, roundDownTo30MinSlot } from '../utils/time';
import LottieView from 'lottie-react-native';

const CHLORINATION_BASE_FIELDS = [
  'pressure',
  'rc',
  'turbidity',
  'ph',
  'tds',
  'tankLevel',
  'flowrate',
  'totalizer',
];

const CHLORINATION_REQUIRED_FIELDS = [
  ['chlorination.pressure', 'Pressure (psi)', 'pressure'],
  ['chlorination.rc', 'RC (Residual Chlorine) ppm', 'rc'],
  ['chlorination.turbidity', 'Turbidity (NTU)', 'turbidity'],
  ['chlorination.ph', 'pH', 'ph'],
  ['chlorination.tds', 'TDS (ppm)', 'tds'],
  ['chlorination.tankLevel', 'Tank level (liters)', 'tankLevel'],
  ['chlorination.flowrate', 'Flowrate (m3/hr)', 'flowrate'],
  ['chlorination.totalizer', 'Totalizer', 'totalizer'],
];

const CHLORINATION_SHIFT_USAGE_FIELDS = [
  'chlorineConsumed',
  'peroxideConsumption',
  'powerConsumptionKwh',
];

const DEEPWELL_BASE_FIELDS = [
  'upstreamPressure',
  'downstreamPressure',
  'flowrate',
  'vfdHz',
  'voltL1',
  'voltL2',
  'voltL3',
  'amperage',
  'tds',
];

const initialChlorinationState = {
  totalizer: '',
  pressure: '',
  rc: '',
  turbidity: '',
  ph: '',
  tds: '',
  tankLevel: '',
  flowrate: '',
  chlorineConsumed: '',
  peroxideConsumption: '',
  powerConsumptionKwh: '',
};

const initialDeepwellState = {
  upstreamPressure: '',
  downstreamPressure: '',
  flowrate: '',
  vfdHz: '',
  voltL1: '',
  voltL2: '',
  voltL3: '',
  amperage: '',
  tds: '',
  powerKwhShift: '',
};

export default function SubmitReadingScreen({ navigation, site }) {
  const { profile } = useAuth();
  const { palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const fieldRefs = useRef({});
  const screenScrollRef = useRef(null);
  const [remarks, setRemarks] = useState('');
  const [chlorination, setChlorination] = useState(initialChlorinationState);
  const [deepwell, setDeepwell] = useState(initialDeepwellState);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false)
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [tipsDismissed, setTipsDismissed] = useState(false);
  const [currentSlot, setCurrentSlot] = useState(() => roundDownTo30MinSlot(new Date()));
  const [invalidFields, setInvalidFields] = useState(() => new Set());
  const [resultTone, setResultTone] = useState('info');
  const [resultMessage, setResultMessage] = useState(() => {
    const now = new Date();
    return `Submitting at ${formatTimestamp(now)} will be recorded under slot ${formatTimestamp(
      roundDownTo30MinSlot(now)
    )}.`;
  });

  const isChlorination = site?.type === 'CHLORINATION';
  const isDeepwell = site?.type === 'DEEPWELL';
  const parameterCount = isChlorination ? 11 : isDeepwell ? 10 : 0;
  const shiftBatchEnabled = isShiftBatchEntryWindow(currentSlot);
  const nextShiftBatchReadingText = nextShiftBatchEntryText(currentSlot);
  const shiftBatchNoticeText = shiftBatchEnabled
    ? 'Open for this shift.'
    : 'Shift usage fields open during the hour before shift turnover.';
  const currentShiftLabel = shiftNameForSlot(currentSlot);
  const completionProgress = useMemo(() => {
    const activeFields = isChlorination
      ? [
          ...CHLORINATION_BASE_FIELDS.map((key) => chlorination[key]),
          ...(shiftBatchEnabled ? CHLORINATION_SHIFT_USAGE_FIELDS.map((key) => chlorination[key]) : []),
        ]
      : isDeepwell
        ? [
            ...DEEPWELL_BASE_FIELDS.map((key) => deepwell[key]),
            ...(shiftBatchEnabled ? [deepwell.powerKwhShift] : []),
          ]
        : [];

    return {
      completed: activeFields.filter((value) => String(value ?? '').trim()).length,
      total: activeFields.length,
    };
  }, [chlorination, deepwell, isChlorination, isDeepwell, shiftBatchEnabled]);

  useEffect(() => {
    refreshOfflineCount();
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentSlot(roundDownTo30MinSlot(new Date()));
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (shiftBatchEnabled) {
      return;
    }

    setChlorination((current) => {
      if (!current.chlorineConsumed && !current.peroxideConsumption && !current.powerConsumptionKwh) {
        return current;
      }

      return {
        ...current,
        chlorineConsumed: '',
        peroxideConsumption: '',
        powerConsumptionKwh: '',
      };
    });

    setDeepwell((current) => {
      if (!current.powerKwhShift) {
        return current;
      }

      return {
        ...current,
        powerKwhShift: '',
      };
    });
  }, [shiftBatchEnabled]);

  const slotPreview = useMemo(() => formatTimestamp(currentSlot), [currentSlot]);

  const deltaPressure = useMemo(() => {
    const up = parseNullableNumber(deepwell.upstreamPressure);
    const down = parseNullableNumber(deepwell.downstreamPressure);

    if (up === null || down === null) {
      return null;
    }

    return (down - up).toFixed(2);
  }, [deepwell.downstreamPressure, deepwell.upstreamPressure]);

  function patchChlorination(key, value) {
    setChlorination((current) => ({ ...current, [key]: value }));
    clearInvalidField(`chlorination.${key}`);
  }

  function patchDeepwell(key, value) {
    setDeepwell((current) => ({ ...current, [key]: value }));
    clearInvalidField(`deepwell.${key}`);
  }

  function setFieldRef(key, ref) {
    if (ref) {
      fieldRefs.current[key] = ref;
    }
  }

  function focusField(key) {
    fieldRefs.current[key]?.focus?.();
  }

  function scrollToResultMessage() {
    setTimeout(() => {
      const scrollView = screenScrollRef.current;

      if (typeof scrollView?.scrollToPosition === 'function') {
        scrollView.scrollToPosition(0, 0, true);
        return;
      }

      if (typeof scrollView?.scrollTo === 'function') {
        scrollView.scrollTo({ y: 0, animated: true });
      }
    }, 80);
  }

  function clearInvalidField(key) {
    setInvalidFields((current) => {
      if (!current.has(key)) {
        return current;
      }

      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  function fieldHasError(key) {
    return invalidFields.has(key);
  }

  function showValidationError(message, fieldKeys = []) {
    setResultTone('error');
    setResultMessage(message);
    setInvalidFields(new Set(fieldKeys));

    if (fieldKeys[0]) {
      focusField(fieldKeys[0]);
    }
  }

  function fillNoChlorinationUsage() {
    setChlorination((current) => ({
      ...current,
      chlorineConsumed: '0',
      peroxideConsumption: '0',
      powerConsumptionKwh: '0',
    }));
    setInvalidFields((current) => {
      const next = new Set(current);
      CHLORINATION_SHIFT_USAGE_FIELDS.forEach((key) => next.delete(`chlorination.${key}`));
      return next;
    });
  }

  function fillNoDeepwellPowerUsage() {
    setDeepwell((current) => ({ ...current, powerKwhShift: '0' }));
    clearInvalidField('deepwell.powerKwhShift');
  }

  async function refreshOfflineCount() {
    const nextCount = await getOfflineReadingCount();
    setOfflineCount(nextCount);
  }

  async function clearForm() {
    setRemarks('');
    setChlorination(initialChlorinationState);
    setDeepwell(initialDeepwellState);
    setInvalidFields(new Set());
  }

  async function handleSyncOfflineReadings() {
    if (syncingOffline) {
      return;
    }

    setSyncingOffline(true);
    setResultTone('info');
    setResultMessage('Syncing offline readings...');

    try {
      const result = await syncOfflineReadings();
      await refreshOfflineCount();

      if (result.remaining) {
        setResultTone('error');
        setResultMessage(
          `${result.synced} offline reading(s) synced. ${result.remaining} still pending. ${
            result.lastError || 'Check the connection and try again.'
          }`
        );
        return;
      }

      const skippedText = result.skipped ? ` ${result.skipped} duplicate slot(s) were already saved.` : '';
      setResultTone('success');
      setResultMessage(`${result.synced} offline reading(s) synced successfully.${skippedText}`);
    } catch (error) {
      setResultTone('error');
      setResultMessage(error.message || 'Failed to sync offline readings.');
      await refreshOfflineCount();
    } finally {
      setSyncingOffline(false);
    }
  }

  async function handleSubmit() {
    const actualNow = new Date();
    const slotDate = roundDownTo30MinSlot(actualNow);
    const slotText = formatTimestamp(slotDate);
    const isSubmitShiftBatchSlot = isShiftBatchEntryWindow(slotDate);

    const payload = {
      site_id: site?.id,
      submitted_by: profile?.id,
      site_type: site?.type,
      reading_datetime: actualNow.toISOString(),
      slot_datetime: slotDate.toISOString(),
    };

    if (remarks.trim()) {
      payload.remarks = remarks.trim();
    }

    if (isChlorination) {
      const totalizerVal = parseNullableNumber(chlorination.totalizer);
      const pressure = parseNullableNumber(chlorination.pressure);
      const rc = parseNullableNumber(chlorination.rc);
      const turbidity = parseNullableNumber(chlorination.turbidity);
      const ph = parseNullableNumber(chlorination.ph);
      const tds = parseNullableNumber(chlorination.tds);
      const tankLevel = parseNullableNumber(chlorination.tankLevel);
      const flowrate = parseNullableNumber(chlorination.flowrate);
      const chlorineConsumed = parseNullableNumber(chlorination.chlorineConsumed);
      const peroxideConsumption = parseNullableNumber(chlorination.peroxideConsumption);
      const powerConsumptionKwh = parseNullableNumber(chlorination.powerConsumptionKwh);

      const missing = CHLORINATION_REQUIRED_FIELDS
        .filter(([, , stateKey]) => parseNullableNumber(chlorination[stateKey]) === null);

      if (missing.length) {
        showValidationError(
          `Missing required CHLORINATION fields: ${missing.map(([, label]) => label).join(', ')}`,
          missing.map(([key]) => key)
        );
        return;
      }

      const numericValues = [
        pressure,
        rc,
        turbidity,
        ph,
        tds,
        tankLevel,
        flowrate,
        chlorineConsumed,
        peroxideConsumption,
        powerConsumptionKwh,
      ];
      if (numericValues.some((value) => value !== null && value < 0)) {
        setResultTone('error');
        setResultMessage('Chlorination values must not be negative.');
        scrollToResultMessage();
        return;
      }

      if (ph !== null && (ph < 0 || ph > 14)) {
        setResultTone('error');
        setResultMessage('pH must be between 0 and 14.');
        scrollToResultMessage();
        return;
      }

      payload.totalizer = totalizerVal;
      if (pressure !== null) payload.pressure_psi = pressure;
      if (rc !== null) payload.rc_ppm = rc;
      if (turbidity !== null) payload.turbidity_ntu = turbidity;
      if (ph !== null) payload.ph = ph;
      if (tds !== null) payload.tds_ppm = tds;
      if (tankLevel !== null) payload.tank_level_liters = tankLevel;
      if (flowrate !== null) payload.flowrate_m3hr = flowrate;
      if (isSubmitShiftBatchSlot) {
        if (chlorineConsumed !== null) payload.chlorine_consumed = chlorineConsumed;
        if (peroxideConsumption !== null) payload.peroxide_consumption = peroxideConsumption;
        if (powerConsumptionKwh !== null) payload.chlorination_power_kwh = powerConsumptionKwh;
      }
    }

    if (isDeepwell) {
      const requiredFields = [
        ['deepwell.upstreamPressure', 'Upstream Pressure (psi)', parseNullableNumber(deepwell.upstreamPressure)],
        ['deepwell.downstreamPressure', 'Downstream Pressure (psi)', parseNullableNumber(deepwell.downstreamPressure)],
        ['deepwell.flowrate', 'Flowrate (m3/hr)', parseNullableNumber(deepwell.flowrate)],
        ['deepwell.vfdHz', 'VFD Frequency (Hz)', parseNullableNumber(deepwell.vfdHz)],
        ['deepwell.voltL1', 'Voltage L1 (V)', parseNullableNumber(deepwell.voltL1)],
        ['deepwell.voltL2', 'Voltage L2 (V)', parseNullableNumber(deepwell.voltL2)],
        ['deepwell.voltL3', 'Voltage L3 (V)', parseNullableNumber(deepwell.voltL3)],
        ['deepwell.amperage', 'Amperage (A)', parseNullableNumber(deepwell.amperage)],
        ['deepwell.tds', 'TDS (ppm)', parseNullableNumber(deepwell.tds)],
      ];
      const powerKwhShift = parseNullableNumber(deepwell.powerKwhShift);

      if (isSubmitShiftBatchSlot) {
        requiredFields.push(['deepwell.powerKwhShift', 'Power Reading per Shift (kWh)', powerKwhShift]);
      }

      const missing = requiredFields
        .filter(([, , value]) => value === null);

      if (missing.length) {
        showValidationError(
          `Missing required DEEPWELL fields: ${missing.map(([, label]) => label).join(', ')}`,
          missing.map(([key]) => key)
        );
        return;
      }

      const values = requiredFields.map(([, , value]) => value);
      if (values.some((value) => value < 0)) {
        setResultTone('error');
        setResultMessage('Deepwell values must not be negative.');
        scrollToResultMessage();
        return;
      }

      payload.upstream_pressure_psi = values[0];
      payload.downstream_pressure_psi = values[1];
      payload.flowrate_m3hr = values[2];
      payload.vfd_frequency_hz = values[3];
      payload.voltage_l1_v = values[4];
      payload.voltage_l2_v = values[5];
      payload.voltage_l3_v = values[6];
      payload.amperage_a = values[7];
      payload.tds_ppm = values[8];
      if (isSubmitShiftBatchSlot) {
        payload.power_kwh_shift = powerKwhShift;
      }
    }

    setSubmitting(true);

    try {
      await createReading(payload);
      setShowSuccessAnim(true);
      setResultTone('success');
      setResultMessage(`Reading saved successfully. Saved under slot ${slotText}.`);
      scrollToResultMessage();
      await clearForm();
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const offlineSave = await enqueueOfflineReading(payload, {
          site_name: site?.name || 'Unknown site',
          site_type: site?.type || 'Unknown type',
          operator_name: profile?.full_name || profile?.email || 'Unknown operator',
          slot_text: slotText,
        });
        await refreshOfflineCount();

        if (offlineSave.duplicate) {
          setResultTone('error');
          setResultMessage(`A reading is already saved offline for slot ${slotText}. Sync that saved reading before entering another record for this slot.`);
          scrollToResultMessage();
          return;
        }

        setResultTone('success');
        setResultMessage(`No connection detected. Reading saved offline for slot ${slotText}. Sync it when the connection returns.`);
        scrollToResultMessage();
        await clearForm();
        return;
      }

      const rawMessage = error.message || 'Failed to save reading.';
      const prettyMessage = /duplicate|already/i.test(rawMessage)
        ? `A reading already exists for slot ${slotText}.`
        : rawMessage;

      setResultTone('error');
      setResultMessage(prettyMessage);
      scrollToResultMessage();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardWrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
    >

      {showSuccessAnim && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.4)', // optional dim background
              zIndex: 999,
              elevation: 10, // Android
            }}
          >
            <LottieView
              source={require('../../assets/submittedAni.json')}
              autoPlay
              loop={false}
              speed={0.6}
              style={{ width: 220, height: 220 }}
              onAnimationFinish={() => {
                setTimeout(() => setShowSuccessAnim(false), 800);
              }}
            />
          </View>
        )}

      <ScreenShell
        eyebrow="Reading form"
        title="Submit reading"
        subtitle={`${site?.name || 'Unknown site'} (${site?.type || 'Unknown type'}) - ${
          profile?.full_name || profile?.email || 'Unknown operator'
        }`}
        keyboardAware
        keyboardAwareProps={{
          keyboardOpeningTime: 0,
          innerRef: (ref) => {
            screenScrollRef.current = ref;
          },
        }}
      >
        <Card style={styles.contextCard}>
          <View style={styles.contextHeader}>
            <View style={styles.contextIcon}>
              <Ionicons
                name={isChlorination ? 'water-outline' : 'flash-outline'}
                size={18}
                color={palette.ink900}
              />
            </View>
            <View style={styles.contextCopy}>
              <Text style={styles.contextLabel}>Current slot preview</Text>
              <Text style={styles.slotValue}>{slotPreview}</Text>
              <Text style={styles.contextMeta}>Submitted by {profile?.full_name || profile?.email || '-'}</Text>
            </View>
          </View>
          <View style={styles.contextStats}>
            <View style={styles.contextPill}>
              <Text style={styles.contextPillLabel}>Site</Text>
              <Text style={styles.contextPillValue}>{site?.name || 'Unknown site'}</Text>
            </View>
            <View style={styles.contextPill}>
              <Text style={styles.contextPillLabel}>Type</Text>
              <Text style={styles.contextPillValue}>{site?.type || 'Unknown type'}</Text>
            </View>
            <View style={styles.contextPill}>
              <Text style={styles.contextPillLabel}>Shift</Text>
              <Text style={styles.contextPillValue}>{currentShiftLabel}</Text>
            </View>
            <View style={styles.contextPill}>
              <Text style={styles.contextPillLabel}>Completed</Text>
              <Text style={styles.contextPillValue}>
                {completionProgress.completed}/{completionProgress.total || parameterCount}
              </Text>
            </View>
          </View>
        </Card>
      
        <MessageBanner tone={resultTone}>{resultMessage}</MessageBanner>

        {offlineCount ? (
          <Card style={styles.offlineCard}>
            <View style={styles.offlineHeader}>
              <View style={styles.offlineIcon}>
                <Ionicons name="cloud-offline-outline" size={18} color={palette.ink900} />
              </View>
              <View style={styles.offlineCopy}>
                <Text style={styles.offlineTitle}>Offline readings pending</Text>
                <Text style={styles.offlineBody}>
                  {offlineCount} saved reading{offlineCount === 1 ? '' : 's'} waiting to sync.
                </Text>
              </View>
            </View>
            <PrimaryButton
              label={syncingOffline ? 'Syncing...' : 'Sync now'}
              onPress={handleSyncOfflineReadings}
              loading={syncingOffline}
              tone="secondary"
              icon={<Ionicons name="sync-outline" size={16} color={palette.ink900} />}
            />
          </Card>
        ) : null}

        {!tipsDismissed ? (
          <Card style={styles.tipCard}>
            <Pressable onPress={() => setTipsDismissed(true)} style={styles.tipDismiss}>
              <Ionicons name="close" size={14} color={palette.ink700} />
            </Pressable>
            <View style={styles.tipHeader}>
              <View style={styles.tipIcon}>
                <Ionicons name="bulb-outline" size={16} color={palette.ink900} />
              </View>
              <View style={styles.tipCopy}>
                <Text style={styles.tipTitle}>Operator tips</Text>
                <Text style={styles.tipBody}>
                  Enter only the measurements for this slot. Blank optional fields will be skipped, and duplicate slot submissions are blocked.
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        <Card style={styles.formCard}>
          <FormField
            label="Reading datetime"
            value={slotPreview}
            editable={false}
            showLockedIndicator={false}
          />

          {isChlorination ? (
            <View style={[styles.section, styles.sectionPanel]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Ionicons name="water-outline" size={16} color={palette.ink900} />
                </View>
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>Chlorination parameters</Text>
                  <Text style={styles.sectionBody}>Capture the treatment values for this 30-minute slot.</Text>
                </View>
              </View>
              <FormField
                ref={(ref) => setFieldRef('chlorination.pressure', ref)}
                label="Pressure (psi) *"
                value={chlorination.pressure}
                onChangeText={(value) => patchChlorination('pressure', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('chlorination.pressure')}
                errorText={fieldHasError('chlorination.pressure') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.rc')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.rc', ref)}
                label="RC (Residual Chlorine) ppm *"
                value={chlorination.rc}
                onChangeText={(value) => patchChlorination('rc', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('chlorination.rc')}
                errorText={fieldHasError('chlorination.rc') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.turbidity')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.turbidity', ref)}
                label="Turbidity (NTU) *"
                value={chlorination.turbidity}
                onChangeText={(value) => patchChlorination('turbidity', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('chlorination.turbidity')}
                errorText={fieldHasError('chlorination.turbidity') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.ph')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.ph', ref)}
                label="pH *"
                value={chlorination.ph}
                onChangeText={(value) => patchChlorination('ph', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('chlorination.ph')}
                errorText={fieldHasError('chlorination.ph') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.tds')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.tds', ref)}
                label="TDS (ppm) *"
                value={chlorination.tds}
                onChangeText={(value) => patchChlorination('tds', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('chlorination.tds')}
                errorText={fieldHasError('chlorination.tds') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.tankLevel')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.tankLevel', ref)}
                label="Tank level (liters) *"
                value={chlorination.tankLevel}
                onChangeText={(value) => patchChlorination('tankLevel', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('chlorination.tankLevel')}
                errorText={fieldHasError('chlorination.tankLevel') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.flowrate')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.flowrate', ref)}
                label="Flowrate (m3/hr) *"
                value={chlorination.flowrate}
                onChangeText={(value) => patchChlorination('flowrate', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('chlorination.flowrate')}
                errorText={fieldHasError('chlorination.flowrate') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() =>
                  focusField('chlorination.totalizer')
                }
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.totalizer', ref)}
                label="Totalizer *"
                value={chlorination.totalizer}
                onChangeText={(value) => patchChlorination('totalizer', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('chlorination.totalizer')}
                errorText={fieldHasError('chlorination.totalizer') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() =>
                  focusField(shiftBatchEnabled ? 'chlorination.chlorineConsumed' : 'remarks')
                }
              />
              <View style={styles.shiftUsageHeader}>
                <View>
                  <Text style={styles.shiftUsageTitle}>Shift Usage</Text>
                  <Text style={styles.shiftUsageMeta}>Chemicals and Power</Text>
                </View>
                {shiftBatchEnabled ? (
                  <Pressable onPress={fillNoChlorinationUsage} style={styles.zeroUsageButton}>
                    <Ionicons name="ban-outline" size={14} color={palette.ink900} />
                    <Text style={styles.zeroUsageText}>No usage</Text>
                  </Pressable>
                ) : null}
              </View>
              <MessageBanner tone={shiftBatchEnabled ? 'success' : 'info'}>{shiftBatchNoticeText}</MessageBanner>
              <FormField
                ref={(ref) => setFieldRef('chlorination.chlorineConsumed', ref)}
                label="Chlorine consumed (kg)"
                value={chlorination.chlorineConsumed}
                onChangeText={(value) => patchChlorination('chlorineConsumed', value)}
                keyboardType="decimal-pad"
                editable={shiftBatchEnabled}
                placeholder={shiftBatchEnabled ? undefined : nextShiftBatchReadingText}
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.peroxideConsumption')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.peroxideConsumption', ref)}
                label="Peroxide consumption"
                value={chlorination.peroxideConsumption}
                onChangeText={(value) => patchChlorination('peroxideConsumption', value)}
                keyboardType="decimal-pad"
                editable={shiftBatchEnabled}
                placeholder={shiftBatchEnabled ? undefined : nextShiftBatchReadingText}
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.powerConsumptionKwh')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.powerConsumptionKwh', ref)}
                label="Power consumption (kWh)"
                value={chlorination.powerConsumptionKwh}
                onChangeText={(value) => patchChlorination('powerConsumptionKwh', value)}
                keyboardType="decimal-pad"
                editable={shiftBatchEnabled}
                placeholder={shiftBatchEnabled ? undefined : nextShiftBatchReadingText}
                returnKeyType="next"
                onSubmitEditing={() => focusField('remarks')}
              />
            </View>
          ) : null}

          {isDeepwell ? (
            <View style={[styles.section, styles.sectionPanel]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Ionicons name="flash-outline" size={16} color={palette.ink900} />
                </View>
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>Deepwell parameters</Text>
                  <Text style={styles.sectionBody}>Capture pump pressure, electrical load, and flow metrics for this slot.</Text>
                </View>
              </View>
              <FormField
                ref={(ref) => setFieldRef('deepwell.upstreamPressure', ref)}
                label="Upstream Pressure (psi) *"
                value={deepwell.upstreamPressure}
                onChangeText={(value) => patchDeepwell('upstreamPressure', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('deepwell.upstreamPressure')}
                errorText={fieldHasError('deepwell.upstreamPressure') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.downstreamPressure')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.downstreamPressure', ref)}
                label="Downstream Pressure (psi) *"
                value={deepwell.downstreamPressure}
                onChangeText={(value) => patchDeepwell('downstreamPressure', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('deepwell.downstreamPressure')}
                errorText={fieldHasError('deepwell.downstreamPressure') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.flowrate')}
              />
              {deltaPressure !== null ? (
                <MessageBanner tone="info">Delta pressure (down - up): {deltaPressure} psi</MessageBanner>
              ) : null}
              <FormField
                ref={(ref) => setFieldRef('deepwell.flowrate', ref)}
                label="Flowrate (m3/hr) *"
                value={deepwell.flowrate}
                onChangeText={(value) => patchDeepwell('flowrate', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('deepwell.flowrate')}
                errorText={fieldHasError('deepwell.flowrate') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.vfdHz')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.vfdHz', ref)}
                label="VFD Frequency (Hz) *"
                value={deepwell.vfdHz}
                onChangeText={(value) => patchDeepwell('vfdHz', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('deepwell.vfdHz')}
                errorText={fieldHasError('deepwell.vfdHz') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.voltL1')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.voltL1', ref)}
                label="Voltage L1 (V) *"
                value={deepwell.voltL1}
                onChangeText={(value) => patchDeepwell('voltL1', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('deepwell.voltL1')}
                errorText={fieldHasError('deepwell.voltL1') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.voltL2')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.voltL2', ref)}
                label="Voltage L2 (V) *"
                value={deepwell.voltL2}
                onChangeText={(value) => patchDeepwell('voltL2', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('deepwell.voltL2')}
                errorText={fieldHasError('deepwell.voltL2') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.voltL3')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.voltL3', ref)}
                label="Voltage L3 (V) *"
                value={deepwell.voltL3}
                onChangeText={(value) => patchDeepwell('voltL3', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('deepwell.voltL3')}
                errorText={fieldHasError('deepwell.voltL3') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.amperage')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.amperage', ref)}
                label="Amperage (A) *"
                value={deepwell.amperage}
                onChangeText={(value) => patchDeepwell('amperage', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('deepwell.amperage')}
                errorText={fieldHasError('deepwell.amperage') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.tds')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.tds', ref)}
                label="TDS (ppm) *"
                value={deepwell.tds}
                onChangeText={(value) => patchDeepwell('tds', value)}
                keyboardType="decimal-pad"
                error={fieldHasError('deepwell.tds')}
                errorText={fieldHasError('deepwell.tds') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() =>
                  focusField(shiftBatchEnabled ? 'deepwell.powerKwhShift' : 'remarks')
                }
              />
              <View style={styles.shiftUsageHeader}>
                <View>
                  <Text style={styles.shiftUsageTitle}>Shift Usage</Text>
                  <Text style={styles.shiftUsageMeta}>Power consumption</Text>
                </View>
                {shiftBatchEnabled ? (
                  <Pressable onPress={fillNoDeepwellPowerUsage} style={styles.zeroUsageButton}>
                    <Ionicons name="ban-outline" size={14} color={palette.ink900} />
                    <Text style={styles.zeroUsageText}>No usage</Text>
                  </Pressable>
                ) : null}
              </View>
              <MessageBanner tone={shiftBatchEnabled ? 'success' : 'info'}>{shiftBatchNoticeText}</MessageBanner>
              <FormField
                ref={(ref) => setFieldRef('deepwell.powerKwhShift', ref)}
                label="Power Reading per Shift (kWh)"
                value={deepwell.powerKwhShift}
                onChangeText={(value) => patchDeepwell('powerKwhShift', value)}
                keyboardType="decimal-pad"
                editable={shiftBatchEnabled}
                placeholder={shiftBatchEnabled ? undefined : nextShiftBatchReadingText}
                error={fieldHasError('deepwell.powerKwhShift')}
                errorText={fieldHasError('deepwell.powerKwhShift') ? 'Required' : ''}
                returnKeyType="next"
                onSubmitEditing={() => focusField('remarks')}
              />
            </View>
          ) : null}

          <View style={[styles.section, styles.sectionPanel]}>
            <FormField
              ref={(ref) => setFieldRef('remarks', ref)}
              label="Remarks"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              placeholder="Remarks (optional)"
              returnKeyType="done"
              blurOnSubmit
              submitBehavior="blurAndSubmit"
              onSubmitEditing={handleSubmit}
            />
          </View>
        </Card>

        <View style={styles.actions}>
          <PrimaryButton
            label="Back"
            onPress={navigation.goBack}
            tone="secondary"
            icon={<Ionicons name="arrow-back-outline" size={16} color={palette.ink900} />}
          />
          <PrimaryButton
            label={submitting ? 'Submitting...' : 'Submit reading'}
            onPress={handleSubmit}
            loading={submitting}
            icon={<Ionicons name="save-outline" size={16} color={palette.onAccent} />}
          />
        </View>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

function createStyles(palette, isDark) {
  return StyleSheet.create({
    keyboardWrap: {
      flex: 1,
    },
    contextCard: {
      gap: 12,
    },
    contextHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    contextIcon: {
      width: 38,
      height: 38,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderWidth: 1,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
    },
    contextCopy: {
      flex: 1,
    },
    contextLabel: {
      color: palette.ink500,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontSize: 12,
      fontWeight: '700',
    },
    slotValue: {
      marginTop: 8,
      color: palette.ink900,
      fontSize: 24,
      fontWeight: '900',
    },
    contextMeta: {
      marginTop: 6,
      color: palette.ink700,
      fontSize: 14,
    },
    contextStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    contextPill: {
      minWidth: 92,
      flexGrow: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? palette.mist : '#F4F9FE',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    contextPillLabel: {
      color: palette.ink500,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    contextPillValue: {
      marginTop: 4,
      color: palette.ink900,
      fontSize: 13,
      fontWeight: '800',
    },
    tipCard: {
      gap: 8,
      backgroundColor: isDark ? '#112B24' : '#ECFCF8',
      borderColor: isDark ? '#1A655E' : '#A7E8DD',
      position: 'relative',
      paddingRight: 42,
    },
    tipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    tipIcon: {
      width: 34,
      height: 34,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#123A37' : '#DDF7F3',
      borderWidth: 1,
      borderColor: isDark ? '#1FAF9E' : '#9EDFD6',
    },
    tipCopy: {
      flex: 1,
      gap: 2,
    },
    tipDismiss: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 22,
      height: 22,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#123A37' : '#DDF7F3',
      borderWidth: 1,
      borderColor: isDark ? '#1FAF9E' : '#9EDFD6',
      zIndex: 1,
    },
    tipTitle: {
      color: palette.ink900,
      fontSize: 15,
      fontWeight: '800',
    },
    tipBody: {
      color: palette.ink700,
      fontSize: 12,
      lineHeight: 18,
    },
    offlineCard: {
      gap: 12,
      backgroundColor: isDark ? '#182235' : '#F2F6FF',
      borderColor: isDark ? '#334769' : '#C7D7F5',
    },
    offlineHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    offlineIcon: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#223353' : '#E2EBFF',
      borderWidth: 1,
      borderColor: isDark ? '#435B86' : '#BCD0F3',
    },
    offlineCopy: {
      flex: 1,
      gap: 2,
    },
    offlineTitle: {
      color: palette.ink900,
      fontSize: 15,
      fontWeight: '800',
    },
    offlineBody: {
      color: palette.ink700,
      fontSize: 12,
      lineHeight: 18,
    },
    formCard: {
      gap: 14,
    },
    section: {
      gap: 12,
      paddingTop: 4,
    },
    sectionPanel: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#0C1621' : '#F8FBFF',
      padding: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    sectionIcon: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#152636' : '#EAF2FB',
      borderWidth: 1,
      borderColor: palette.line,
    },
    sectionCopy: {
      flex: 1,
      gap: 2,
    },
    sectionTitle: {
      color: palette.ink900,
      fontSize: 18,
      fontWeight: '800',
    },
    sectionBody: {
      color: palette.ink700,
      fontSize: 12,
      lineHeight: 18,
    },
    shiftUsageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingTop: 4,
    },
    shiftUsageTitle: {
      color: palette.ink900,
      fontSize: 14,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    shiftUsageMeta: {
      marginTop: 2,
      color: palette.ink700,
      fontSize: 12,
      fontWeight: '600',
    },
    zeroUsageButton: {
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? '#1A655E' : '#B4E5DE',
      backgroundColor: isDark ? '#11312D' : '#E5F5F3',
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    zeroUsageText: {
      color: palette.ink900,
      fontSize: 12,
      fontWeight: '900',
    },
    actions: {
      gap: 12,
      paddingBottom: 18,
    },
  });
}
