import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Card from '../components/Card';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { listAccessibleSites } from '../services/sites';

export default function SiteSelectionScreen({ navigation }) {
  const { profile, signOut } = useAuth();
  const { palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const isPrivileged =
    profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'manager';
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadSites() {
      setLoading(true);

      try {
        const nextSites = await listAccessibleSites();
        if (!mounted) {
          return;
        }

        setSites(nextSites);
        setSelectedSite(nextSites[0] || null);

        if (!nextSites.length) {
          setMessage('No sites were found. Re-run the schema seed if the sites table is empty.');
        }
      } catch (error) {
        if (mounted) {
          setMessage(error.message || 'Failed to load sites.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadSites();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ScreenShell
      eyebrow="Available sites"
      title="Select site"
      subtitle={`Signed in as ${profile?.full_name || profile?.email || 'User'} (${profile?.role || 'operator'})`}
    >
      <Card>
        <Text style={styles.sectionTitle}>Choose the site for this shift</Text>
        <Text style={styles.sectionBody}>
          Sign in once, then choose Site 1 or Site 2 depending on where you are assigned today.
        </Text>
      </Card>

      {message ? <MessageBanner tone={sites.length ? 'info' : 'error'}>{message}</MessageBanner> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={palette.teal600} />
        </View>
      ) : (
        <View style={styles.options}>
          {sites.map((site) => {
            const active = selectedSite?.id === site.id;
            return (
              <Pressable
                key={site.id}
                onPress={() => setSelectedSite(site)}
                style={[styles.option, active && styles.optionActive]}
              >
                <View style={styles.optionTopRow}>
                  <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                    {site.name}
                  </Text>
                  <View style={[styles.badge, active && styles.badgeActive]}>
                    <Text style={[styles.badgeLabel, active && styles.badgeLabelActive]}>
                      {site.type}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.optionBody, active && styles.optionBodyActive]}>
                  Site ID {site.id}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.actions}>
        <PrimaryButton
          label="Continue to reading form"
          onPress={() =>
            selectedSite
              ? navigation.navigate('submit-reading', { site: selectedSite })
              : null
          }
          disabled={!selectedSite}
        />
        <PrimaryButton
          label="Open reading history"
          onPress={() =>
            selectedSite
              ? navigation.navigate('reading-history', { site: selectedSite })
              : null
          }
          disabled={!selectedSite}
          tone="secondary"
        />
        {isPrivileged ? (
          <PrimaryButton
            label="Back to office dashboard"
            onPress={() => navigation.navigate('office-dashboard')}
            tone="secondary"
          />
        ) : null}
        <PrimaryButton label="Sign out" onPress={signOut} tone="secondary" />
      </View>
    </ScreenShell>
  );
}

function createStyles(palette, isDark) {
  return StyleSheet.create({
    sectionTitle: {
      color: palette.ink900,
      fontSize: 18,
      fontWeight: '800',
    },
    sectionBody: {
      marginTop: 8,
      color: palette.ink700,
      fontSize: 14,
      lineHeight: 20,
    },
    loadingWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 32,
    },
    options: {
      gap: 12,
    },
    actions: {
      gap: 12,
    },
    option: {
      backgroundColor: palette.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.line,
      padding: 16,
    },
    optionActive: {
      backgroundColor: palette.navy700,
      borderColor: palette.cyan300,
    },
    optionTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 10,
    },
    optionTitle: {
      flex: 1,
      color: palette.ink900,
      fontSize: 17,
      fontWeight: '800',
    },
    optionTitleActive: {
      color: palette.onAccent,
    },
    optionBody: {
      marginTop: 10,
      color: palette.ink700,
      fontSize: 14,
    },
    optionBodyActive: {
      color: palette.heroSubtitle,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? '#15312D' : '#E8F7F6',
    },
    badgeActive: {
      backgroundColor: isDark ? '#17374D' : '#E6FBFF',
    },
    badgeLabel: {
      color: palette.teal600,
      fontSize: 11,
      fontWeight: '800',
    },
    badgeLabelActive: {
      color: palette.ink900,
    },
  });
}
