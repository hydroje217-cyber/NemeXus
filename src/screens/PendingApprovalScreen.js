import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../components/Card';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function PendingApprovalScreen() {
  const { profile, signOut, refreshProfile, pendingApprovalMessage } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <ScreenShell
      eyebrow="Approval required"
      title="Account pending approval"
      subtitle="The office needs to approve this registration before data collection is allowed."
    >
      <Card>
        <Text style={styles.title}>Signed in as</Text>
        <Text style={styles.value}>{profile?.full_name || profile?.email || 'Unknown user'}</Text>
        <Text style={styles.meta}>Role: {profile?.role || 'operator'}</Text>
      </Card>

      {pendingApprovalMessage ? (
        <MessageBanner tone="success">{pendingApprovalMessage}</MessageBanner>
      ) : null}

      <MessageBanner tone="info">
        Operators cannot access site selection, submission, or reading history until office staff approve the account in the office dashboard.
      </MessageBanner>

      <Card>
        <Text style={styles.title}>What the approver should do</Text>
        <Text style={styles.body}>1. Sign in to the web dashboard with an office account.</Text>
        <Text style={styles.body}>2. Open the pending registrations list.</Text>
        <Text style={styles.body}>3. Approve this operator from the dashboard.</Text>
        <Text style={styles.body}>4. Ask the operator to refresh this screen or sign in again.</Text>
      </Card>

      <View style={styles.actions}>
        <PrimaryButton label="Refresh approval status" onPress={refreshProfile} />
        <PrimaryButton label="Sign out" onPress={signOut} tone="secondary" />
      </View>
    </ScreenShell>
  );
}

function createStyles(palette) {
  return StyleSheet.create({
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
    body: {
      marginTop: 8,
      color: palette.ink700,
      fontSize: 14,
      lineHeight: 20,
    },
    actions: {
      gap: 12,
    },
  });
}
