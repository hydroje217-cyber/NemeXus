import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Card from '../components/Card';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getOfflineReadingCount, syncOfflineReadings } from '../services/offlineReadings';
import { listAccessibleSites } from '../services/sites';

function getSiteDescription(type) {
  return type === 'CHLORINATION'
    ? 'Residual chlorine, tank level, flowrate, and treatment checks.'
    : 'Pressure, flow, power, and electrical monitoring for the pump station.';
}

export default function SiteSelectionScreen({ navigation }) {
  const { profile, signOut } = useAuth();
  const { palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const isPrivileged =
    profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'manager';
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [message, setMessage] = useState('');
  const [offlineMessage, setOfflineMessage] = useState('');
  const [offlineTone, setOfflineTone] = useState('info');

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
        const nextOfflineCount = await getOfflineReadingCount();
        if (mounted) {
          setOfflineCount(nextOfflineCount);
        }

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

  async function refreshOfflineCount() {
    const nextCount = await getOfflineReadingCount();
    setOfflineCount(nextCount);
  }

  async function handleSyncOfflineReadings() {
    if (syncingOffline) {
      return;
    }

    setSyncingOffline(true);
    setOfflineTone('info');
    setOfflineMessage('Syncing offline readings...');

    try {
      const result = await syncOfflineReadings();
      await refreshOfflineCount();

      if (result.remaining) {
        setOfflineTone('error');
        setOfflineMessage(
          `${result.synced} offline reading(s) synced. ${result.remaining} still pending. ${
            result.lastError || 'Check the connection and try again.'
          }`
        );
        return;
      }

      const skippedText = result.skipped ? ` ${result.skipped} duplicate slot(s) were already saved.` : '';
      setOfflineTone('success');
      setOfflineMessage(`${result.synced} offline reading(s) synced successfully.${skippedText}`);
    } catch (error) {
      setOfflineTone('error');
      setOfflineMessage(error.message || 'Failed to sync offline readings.');
      await refreshOfflineCount();
    } finally {
      setSyncingOffline(false);
    }
  }

  return (
    <ScreenShell
      eyebrow="Operator workspace"
      title="Select site"
      subtitle={`Signed in as ${profile?.full_name || profile?.email || 'User'} (${profile?.role || 'operator'})`}
    >
      <Card style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryIcon}>
            <Ionicons name="compass-outline" size={18} color={palette.ink900} />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.sectionTitle}>Choose the site for this shift</Text>
            <Text style={styles.sectionBody}>
              Confirm where you are assigned today, then continue to submit a new reading or review recent history.
            </Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Operator</Text>
            <Text style={styles.metaValue}>{profile?.full_name || profile?.email || 'Unknown user'}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Role</Text>
            <Text style={styles.metaValue}>{String(profile?.role || 'operator').toUpperCase()}</Text>
          </View>
        </View>
      </Card>

      {selectedSite ? (
        <Card style={styles.selectionCard}>
          <View style={styles.selectionHeader}>
            <View style={styles.selectionIcon}>
              <Ionicons
                name={selectedSite.type === 'CHLORINATION' ? 'water-outline' : 'flash-outline'}
                size={16}
                color={palette.ink900}
              />
            </View>
            <View style={styles.selectionCopy}>
              <Text style={styles.selectionTitle}>Ready for {selectedSite.name}</Text>
              <Text style={styles.selectionBody}>
                {selectedSite.type === 'CHLORINATION' ? 'Chlorination line' : 'Deepwell station'}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {message ? <MessageBanner tone={sites.length ? 'info' : 'error'}>{message}</MessageBanner> : null}
      {offlineMessage ? <MessageBanner tone={offlineTone}>{offlineMessage}</MessageBanner> : null}

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
                <View style={[styles.optionAccent, active && styles.optionAccentActive]} />
                <View style={styles.optionTopRow}>
                  <View style={[styles.typeIcon, active && styles.typeIconActive]}>
                    <Ionicons
                      name={site.type === 'CHLORINATION' ? 'water-outline' : 'flash-outline'}
                      size={17}
                      color={active ? palette.onAccent : palette.ink900}
                    />
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{site.name}</Text>
                    <Text style={[styles.optionSubhead, active && styles.optionSubheadActive]}>
                      {getSiteDescription(site.type)}
                    </Text>
                  </View>
                  <View style={[styles.badge, active && styles.badgeActive]}>
                    <Text style={[styles.badgeLabel, active && styles.badgeLabelActive]}>{site.type}</Text>
                  </View>
                </View>
                <View style={styles.optionMetaRow}>
                  <View style={[styles.optionMetaPill, active && styles.optionMetaPillActive]}>
                    <Ionicons
                      name="location-outline"
                      size={12}
                      color={active ? palette.onAccent : palette.ink700}
                    />
                    <Text style={[styles.optionMetaText, active && styles.optionMetaTextActive]}>
                      Site ID {site.id}
                    </Text>
                  </View>
                  <View style={[styles.optionMetaPill, active && styles.optionMetaPillActive]}>
                    <Ionicons
                      name={active ? 'checkmark-circle' : 'ellipse-outline'}
                      size={12}
                      color={active ? palette.onAccent : palette.ink700}
                    />
                    <Text style={[styles.optionMetaText, active && styles.optionMetaTextActive]}>
                      {active ? 'Selected now' : 'Tap to select'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.actions}>
        <PrimaryButton
          label="Continue to reading form"
          onPress={() => (selectedSite ? navigation.navigate('submit-reading', { site: selectedSite }) : null)}
          disabled={!selectedSite}
          icon={<Ionicons name="create-outline" size={16} color={palette.onAccent} />}
        />
        <PrimaryButton
          label="Open reading history"
          onPress={() => (selectedSite ? navigation.navigate('reading-history', { site: selectedSite }) : null)}
          disabled={!selectedSite}
          tone="secondary"
          icon={<Ionicons name="time-outline" size={16} color={palette.ink900} />}
        />
        {isPrivileged ? (
          <PrimaryButton
            label="Back to office dashboard"
            onPress={() => navigation.navigate('office-dashboard')}
            tone="secondary"
            icon={<Ionicons name="grid-outline" size={16} color={palette.ink900} />}
          />
        ) : null}
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

function createStyles(palette, isDark) {
  return StyleSheet.create({
    summaryCard: {
      gap: 12,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    summaryIcon: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#16304A' : '#EAF2FB',
      borderWidth: 1,
      borderColor: isDark ? '#31506E' : '#C9DDF3',
    },
    summaryCopy: {
      flex: 1,
    },
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
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    metaPill: {
      minWidth: 120,
      flexGrow: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? palette.mist : '#F4F9FE',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    metaLabel: {
      color: palette.ink500,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    metaValue: {
      marginTop: 4,
      color: palette.ink900,
      fontSize: 13,
      fontWeight: '700',
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
      overflow: 'hidden',
    },
    optionActive: {
      backgroundColor: palette.navy700,
      borderColor: palette.cyan300,
    },
    optionAccent: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      backgroundColor: isDark ? '#31506E' : '#D5E8FA',
    },
    optionAccentActive: {
      backgroundColor: palette.cyan300,
    },
    optionTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 10,
    },
    typeIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#152636' : '#EAF2FB',
      borderWidth: 1,
      borderColor: palette.line,
    },
    typeIconActive: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderColor: 'rgba(255,255,255,0.18)',
    },
    optionCopy: {
      flex: 1,
      gap: 4,
    },
    optionTitle: {
      color: palette.ink900,
      fontSize: 17,
      fontWeight: '800',
    },
    optionTitleActive: {
      color: palette.onAccent,
    },
    optionSubhead: {
      color: palette.ink700,
      fontSize: 12,
      lineHeight: 17,
    },
    optionSubheadActive: {
      color: palette.heroSubtitle,
    },
    optionMetaRow: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    optionMetaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: isDark ? '#152636' : '#F2F8FE',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    optionMetaPillActive: {
      borderColor: 'rgba(255,255,255,0.18)',
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    optionMetaText: {
      color: palette.ink700,
      fontSize: 11,
      fontWeight: '700',
    },
    optionMetaTextActive: {
      color: palette.onAccent,
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
    selectionCard: {
      gap: 6,
      backgroundColor: isDark ? '#112B24' : '#ECFCF8',
      borderColor: isDark ? '#1A655E' : '#A7E8DD',
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    selectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    selectionIcon: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#123A37' : '#DDF7F3',
      borderWidth: 1,
      borderColor: isDark ? '#1FAF9E' : '#9EDFD6',
    },
    selectionCopy: {
      flex: 1,
      gap: 1,
    },
    selectionTitle: {
      color: palette.ink900,
      fontSize: 14,
      fontWeight: '800',
    },
    selectionBody: {
      color: palette.ink700,
      fontSize: 11,
      lineHeight: 15,
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
  });
}
