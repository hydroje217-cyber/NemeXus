import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Card from '../components/Card';
import ScreenShell from '../components/ScreenShell';
import { useTheme } from '../context/ThemeContext';
import { supabaseMissingMessage } from '../lib/supabase';

export default function SetupRequiredScreen() {
  const { palette } = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <ScreenShell
      eyebrow="Setup required"
      title="Connect this app to Supabase"
      subtitle="The frontend is wired for authentication and PostgreSQL, but it still needs your project credentials."
    >
      <Card>
        <Text style={styles.title}>Missing environment variables</Text>
        <Text style={styles.body}>{supabaseMissingMessage}</Text>
      </Card>

      <Card>
        <Text style={styles.title}>Next steps</Text>
        <Text style={styles.body}>1. Copy `.env.example` to `.env`.</Text>
        <Text style={styles.body}>2. Add your Supabase URL and publishable key.</Text>
        <Text style={styles.body}>3. Run the SQL in `supabase/schema.sql`.</Text>
        <Text style={styles.body}>4. Restart Expo.</Text>
      </Card>
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
    body: {
      marginTop: 8,
      color: palette.ink700,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}
