import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Card from '../components/Card';
import FormField from '../components/FormField';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function ResetPasswordScreen({ navigation, initialMessage = '', initialTone = 'info' }) {
  const { updatePassword } = useAuth();
  const { palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState(initialMessage);
  const [tone, setTone] = useState(initialTone);
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password.trim() && confirmPassword.trim() && password === confirmPassword;

  useEffect(() => {
    setMessage(initialMessage);
    setTone(initialTone);
  }, [initialMessage, initialTone]);

  async function handleSubmit() {
    if (!passwordsMatch) {
      setTone('error');
      setMessage('Passwords must match before you can save the new password.');
      return;
    }

    setLoading(true);
    const action = await updatePassword({ password });
    setLoading(false);
    setTone(action.ok ? 'success' : 'error');
    setMessage(action.message || (action.ok ? 'Password updated.' : 'Unable to update password.'));

    if (action.ok) {
      if (navigation.finishPasswordReset) {
        navigation.finishPasswordReset();
      } else {
        navigation.reset();
      }
    }
  }

  return (
    <ScreenShell
      eyebrow="Account recovery"
      title="Set a new password"
      subtitle="Open this screen from the reset email, choose a new password, and continue back into the app."
      keyboardAware
      keyboardAwareProps={{
        keyboardOpeningTime: 0,
        extraScrollHeight: 84,
        extraHeight: 120,
        enableAutomaticScroll: true,
      }}
    >
      <Card>
        <View style={styles.cardTitleRow}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="shield-checkmark-outline" size={18} color={palette.ink900} />
          </View>
          <Text style={styles.cardTitle}>Reset password</Text>
        </View>
        <Text style={styles.cardBody}>
          Choose a strong new password for your NemeXus Monitoring account.
        </Text>
      </Card>

      {message ? <MessageBanner tone={tone}>{message}</MessageBanner> : null}

      <Card style={styles.formCard}>
        <FormField
          label="New password"
          value={password}
          onChangeText={setPassword}
          placeholder="Minimum 6 characters"
          secureTextEntry
          autoCapitalize="none"
          icon={<Ionicons name="lock-closed-outline" size={18} color={palette.ink500} />}
        />
        <FormField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter your new password"
          secureTextEntry
          autoCapitalize="none"
          icon={<Ionicons name="checkmark-circle-outline" size={18} color={palette.ink500} />}
        />

        <PrimaryButton
          label="Save new password"
          onPress={handleSubmit}
          loading={loading}
          disabled={!password.trim() || !confirmPassword.trim()}
          icon={<Ionicons name="save-outline" size={18} color={palette.onAccent} />}
        />
      </Card>
    </ScreenShell>
  );
}

function createStyles(palette, isDark) {
  return StyleSheet.create({
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    cardIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderWidth: 1,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
    },
    cardTitle: {
      color: palette.ink900,
      fontSize: 19,
      fontWeight: '800',
    },
    cardBody: {
      marginTop: 8,
      color: palette.ink700,
      fontSize: 14,
      lineHeight: 20,
    },
    formCard: {
      gap: 14,
    },
  });
}
