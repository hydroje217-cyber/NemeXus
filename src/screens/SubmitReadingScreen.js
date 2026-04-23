import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Card from '../components/Card';
import FormField from '../components/FormField';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { createReading } from '../services/readings';
import { parseNullableNumber } from '../utils/readings';
import { formatTimestamp, roundDownTo30MinSlot } from '../utils/time';

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
  const { palette } = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const fieldRefs = useRef({});
  const [remarks, setRemarks] = useState('');
  const [chlorination, setChlorination] = useState(initialChlorinationState);
  const [deepwell, setDeepwell] = useState(initialDeepwellState);
  const [submitting, setSubmitting] = useState(false);
  const [resultTone, setResultTone] = useState('info');
  const [resultMessage, setResultMessage] = useState(() => {
    const now = new Date();
    return `Submitting at ${formatTimestamp(now)} will be recorded under slot ${formatTimestamp(
      roundDownTo30MinSlot(now)
    )}.`;
  });

  const isChlorination = site?.type === 'CHLORINATION';
  const isDeepwell = site?.type === 'DEEPWELL';

  const slotPreview = useMemo(() => {
    const now = new Date();
    return formatTimestamp(roundDownTo30MinSlot(now));
  }, [resultMessage]);

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
  }

  function patchDeepwell(key, value) {
    setDeepwell((current) => ({ ...current, [key]: value }));
  }

  function setFieldRef(key, ref) {
    if (ref) {
      fieldRefs.current[key] = ref;
    }
  }

  function focusField(key) {
    fieldRefs.current[key]?.focus?.();
  }

  async function handleSubmit() {
    const actualNow = new Date();
    const slotText = formatTimestamp(roundDownTo30MinSlot(actualNow));

    const payload = {
      site_id: site?.id,
      submitted_by: profile?.id,
      site_type: site?.type,
      reading_datetime: actualNow.toISOString(),
      slot_datetime: roundDownTo30MinSlot(actualNow).toISOString(),
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

      if (totalizerVal === null) {
        setResultTone('error');
        setResultMessage('Totalizer is required for CHLORINATION.');
        return;
      }

      const numericValues = [pressure, rc, turbidity, ph, tds, tankLevel, flowrate, chlorineConsumed];
      if (numericValues.some((value) => value !== null && value < 0)) {
        setResultTone('error');
        setResultMessage('Chlorination values must not be negative.');
        return;
      }

      if (ph !== null && (ph < 0 || ph > 14)) {
        setResultTone('error');
        setResultMessage('pH must be between 0 and 14.');
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
      if (chlorineConsumed !== null) payload.chlorine_consumed = chlorineConsumed;
    }

    if (isDeepwell) {
      const requiredFields = [
        ['Upstream Pressure (psi)', parseNullableNumber(deepwell.upstreamPressure)],
        ['Downstream Pressure (psi)', parseNullableNumber(deepwell.downstreamPressure)],
        ['Flowrate (m3/hr)', parseNullableNumber(deepwell.flowrate)],
        ['VFD Frequency (Hz)', parseNullableNumber(deepwell.vfdHz)],
        ['Voltage L1 (V)', parseNullableNumber(deepwell.voltL1)],
        ['Voltage L2 (V)', parseNullableNumber(deepwell.voltL2)],
        ['Voltage L3 (V)', parseNullableNumber(deepwell.voltL3)],
        ['Amperage (A)', parseNullableNumber(deepwell.amperage)],
        ['TDS (ppm)', parseNullableNumber(deepwell.tds)],
        ['Power Reading per Shift (kWh)', parseNullableNumber(deepwell.powerKwhShift)],
      ];

      const missing = requiredFields
        .filter(([, value]) => value === null)
        .map(([label]) => label);

      if (missing.length) {
        setResultTone('error');
        setResultMessage(`Missing required DEEPWELL fields: ${missing.join(', ')}`);
        return;
      }

      const values = requiredFields.map(([, value]) => value);
      if (values.some((value) => value < 0)) {
        setResultTone('error');
        setResultMessage('Deepwell values must not be negative.');
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
      payload.power_kwh_shift = values[9];
    }

    setSubmitting(true);

    try {
      await createReading(payload);
      setResultTone('success');
      setResultMessage(`Reading saved successfully. Saved under slot ${slotText}.`);
      setRemarks('');
      setChlorination(initialChlorinationState);
      setDeepwell(initialDeepwellState);
    } catch (error) {
      const rawMessage = error.message || 'Failed to save reading.';
      const prettyMessage = /duplicate|already/i.test(rawMessage)
        ? `A reading already exists for slot ${slotText}.`
        : rawMessage;

      setResultTone('error');
      setResultMessage(prettyMessage);
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
      <ScreenShell
        eyebrow="Reading form"
        title="Submit reading"
        subtitle={`${site?.name || 'Unknown site'} (${site?.type || 'Unknown type'}) - ${
          profile?.full_name || profile?.email || 'Unknown operator'
        }`}
        keyboardAware
        keyboardAwareProps={{
          keyboardOpeningTime: 0,
        }}
      >
        <Card>
          <Text style={styles.contextLabel}>Current slot preview</Text>
          <Text style={styles.slotValue}>{slotPreview}</Text>
          <Text style={styles.contextMeta}>Submitted by {profile?.full_name || profile?.email || '-'}</Text>
        </Card>

        <MessageBanner tone={resultTone}>{resultMessage}</MessageBanner>

        <Card style={styles.formCard}>
          <FormField
            label="Reading datetime"
            value={slotPreview}
            editable={false}
          />

          {isChlorination ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Chlorination parameters</Text>
              <FormField
                ref={(ref) => setFieldRef('chlorination.pressure', ref)}
                label="Pressure (psi)"
                value={chlorination.pressure}
                onChangeText={(value) => patchChlorination('pressure', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.rc')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.rc', ref)}
                label="RC (Residual Chlorine) ppm"
                value={chlorination.rc}
                onChangeText={(value) => patchChlorination('rc', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.turbidity')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.turbidity', ref)}
                label="Turbidity (NTU)"
                value={chlorination.turbidity}
                onChangeText={(value) => patchChlorination('turbidity', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.ph')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.ph', ref)}
                label="pH"
                value={chlorination.ph}
                onChangeText={(value) => patchChlorination('ph', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.tds')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.tds', ref)}
                label="TDS (ppm)"
                value={chlorination.tds}
                onChangeText={(value) => patchChlorination('tds', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.tankLevel')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.tankLevel', ref)}
                label="Tank level (liters)"
                value={chlorination.tankLevel}
                onChangeText={(value) => patchChlorination('tankLevel', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.flowrate')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.flowrate', ref)}
                label="Flowrate (m3/hr)"
                value={chlorination.flowrate}
                onChangeText={(value) => patchChlorination('flowrate', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.chlorineConsumed')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.chlorineConsumed', ref)}
                label="Chlorine consumed (kg)"
                value={chlorination.chlorineConsumed}
                onChangeText={(value) => patchChlorination('chlorineConsumed', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('chlorination.totalizer')}
              />
              <FormField
                ref={(ref) => setFieldRef('chlorination.totalizer', ref)}
                label="Totalizer (required)"
                value={chlorination.totalizer}
                onChangeText={(value) => patchChlorination('totalizer', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('remarks')}
              />
            </View>
          ) : null}

          {isDeepwell ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Deepwell parameters</Text>
              <FormField
                ref={(ref) => setFieldRef('deepwell.upstreamPressure', ref)}
                label="Upstream Pressure (psi)"
                value={deepwell.upstreamPressure}
                onChangeText={(value) => patchDeepwell('upstreamPressure', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.downstreamPressure')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.downstreamPressure', ref)}
                label="Downstream Pressure (psi)"
                value={deepwell.downstreamPressure}
                onChangeText={(value) => patchDeepwell('downstreamPressure', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.flowrate')}
              />
              {deltaPressure !== null ? (
                <MessageBanner tone="info">Delta pressure (down - up): {deltaPressure} psi</MessageBanner>
              ) : null}
              <FormField
                ref={(ref) => setFieldRef('deepwell.flowrate', ref)}
                label="Flowrate (m3/hr)"
                value={deepwell.flowrate}
                onChangeText={(value) => patchDeepwell('flowrate', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.vfdHz')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.vfdHz', ref)}
                label="VFD Frequency (Hz)"
                value={deepwell.vfdHz}
                onChangeText={(value) => patchDeepwell('vfdHz', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.voltL1')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.voltL1', ref)}
                label="Voltage L1 (V)"
                value={deepwell.voltL1}
                onChangeText={(value) => patchDeepwell('voltL1', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.voltL2')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.voltL2', ref)}
                label="Voltage L2 (V)"
                value={deepwell.voltL2}
                onChangeText={(value) => patchDeepwell('voltL2', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.voltL3')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.voltL3', ref)}
                label="Voltage L3 (V)"
                value={deepwell.voltL3}
                onChangeText={(value) => patchDeepwell('voltL3', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.amperage')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.amperage', ref)}
                label="Amperage (A)"
                value={deepwell.amperage}
                onChangeText={(value) => patchDeepwell('amperage', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.tds')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.tds', ref)}
                label="TDS (ppm)"
                value={deepwell.tds}
                onChangeText={(value) => patchDeepwell('tds', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('deepwell.powerKwhShift')}
              />
              <FormField
                ref={(ref) => setFieldRef('deepwell.powerKwhShift', ref)}
                label="Power Reading per Shift (kWh)"
                value={deepwell.powerKwhShift}
                onChangeText={(value) => patchDeepwell('powerKwhShift', value)}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => focusField('remarks')}
              />
            </View>
          ) : null}

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
        </Card>

        <View style={styles.actions}>
          <PrimaryButton label="Back" onPress={navigation.goBack} tone="secondary" />
          <PrimaryButton
            label={submitting ? 'Submitting...' : 'Submit reading'}
            onPress={handleSubmit}
            loading={submitting}
          />
        </View>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

function createStyles(palette) {
  return StyleSheet.create({
    keyboardWrap: {
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
    formCard: {
      gap: 14,
    },
    section: {
      gap: 12,
      paddingTop: 4,
    },
    sectionTitle: {
      color: palette.ink900,
      fontSize: 18,
      fontWeight: '800',
    },
    actions: {
      gap: 12,
      paddingBottom: 18,
    },
  });
}
