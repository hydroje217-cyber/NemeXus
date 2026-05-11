import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Card from '../components/Card';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getResponsiveMetrics, scaleStyleDefinitions } from '../theme';

const approvalSteps = [
  'Sign in to the office dashboard with an office account.',
  'Open the pending registrations list.',
  'Approve this operator from the dashboard.',
  'Ask the operator to refresh this screen or sign in again.',
];

export default function PendingApprovalScreen() {
  const { profile, signOut, refreshProfile, pendingApprovalMessage } = useAuth();
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const responsiveMetrics = useMemo(() => getResponsiveMetrics(width), [width]);
  const styles = useMemo(() => createStyles(palette, isDark, responsiveMetrics), [palette, isDark, responsiveMetrics]);

  return (
    <ScreenShell
      eyebrow="Approval required"
      title="Account pending approval"
      subtitle="The office needs to approve this registration before data collection is allowed."
    >
      <Card style={styles.identityCard}>
        <View style={styles.identityHeader}>
          <View style={styles.identityIcon}>
            <Ionicons name="shield-checkmark-outline" size={18} color={palette.ink900} />
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.title}>Signed in as</Text>
            <Text style={styles.value}>{profile?.full_name || profile?.email || 'Unknown user'}</Text>
            <Text style={styles.meta}>Role: {profile?.role || 'operator'}</Text>
          </View>
        </View>
        <View style={styles.statusPill}>
          <Ionicons name="time-outline" size={12} color={palette.warningText} />
          <Text style={styles.statusPillText}>Waiting for office approval</Text>
        </View>
      </Card>

      {pendingApprovalMessage ? <MessageBanner tone="success">{pendingApprovalMessage}</MessageBanner> : null}

      <MessageBanner tone="info">
        Operators cannot access site selection, submission, or reading history until office staff approve the account in the office dashboard.
      </MessageBanner>

      <Card style={styles.stepsCard}>
        <View style={styles.stepsHeader}>
          <View style={styles.stepsIcon}>
            <Ionicons name="list-outline" size={17} color={palette.ink900} />
          </View>
          <View style={styles.stepsCopy}>
            <Text style={styles.title}>What the approver should do</Text>
            <Text style={styles.stepsBody}>Share these steps with the office if approval is still pending.</Text>
          </View>
        </View>
        <View style={styles.stepsList}>
          {approvalSteps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.body}>{step}</Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.actions}>
        <PrimaryButton
          label="Refresh approval status"
          onPress={refreshProfile}
          icon={<Ionicons name="refresh-outline" size={16} color={palette.onAccent} />}
        />
        <PrimaryButton
          label="Sign out"
          onPress={signOut}
          tone="secondary"
          icon={<Ionicons name="log-out-outline" size={16} color={palette.ink900} />}
        />
      </View>
    </ScreenShell>
  );
}

function createStyles(palette, isDark, responsiveMetrics) {
  return StyleSheet.create(scaleStyleDefinitions({
    identityCard: {
      gap: 14,
    },
    identityHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    identityIcon: {
      width: 38,
      height: 38,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderWidth: 1,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
    },
    identityCopy: {
      flex: 1,
    },
    title: {
      color: palette.ink900,
      fontSize: 18,
      fontWeight: '800',
    },
    value: {
      marginTop: 8,
      color: palette.ink900,
      fontSize: 20,
      fontWeight: '900',
    },
    meta: {
      marginTop: 6,
      color: palette.ink700,
      fontSize: 14,
    },
    statusPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      backgroundColor: palette.warningBg,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    statusPillText: {
      color: palette.warningText,
      fontSize: 11,
      fontWeight: '800',
    },
    stepsCard: {
      gap: 12,
    },
    stepsHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    stepsIcon: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#123A37' : '#E5F5F3',
      borderWidth: 1,
      borderColor: isDark ? '#1FAF9E' : '#B4E5DE',
    },
    stepsCopy: {
      flex: 1,
    },
    stepsBody: {
      marginTop: 6,
      color: palette.ink700,
      fontSize: 13,
      lineHeight: 18,
    },
    stepsList: {
      gap: 10,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    stepBadge: {
      width: 24,
      height: 24,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#152636' : '#EAF2FB',
      borderWidth: 1,
      borderColor: palette.line,
      marginTop: 1,
    },
    stepBadgeText: {
      color: palette.ink900,
      fontSize: 11,
      fontWeight: '800',
    },
    body: {
      flex: 1,
      color: palette.ink700,
      fontSize: 14,
      lineHeight: 20,
    },
    actions: {
      gap: 12,
    },
  }, responsiveMetrics));
}
