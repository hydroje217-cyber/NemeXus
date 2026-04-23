import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { supabaseReady } from './lib/supabase';
import AuthScreen from './screens/AuthScreen';
import LoadingScreen from './screens/LoadingScreen';
import OfficeDashboardScreen from './screens/OfficeDashboardScreen';
import PendingApprovalScreen from './screens/PendingApprovalScreen';
import SetupRequiredScreen from './screens/SetupRequiredScreen';
import SiteSelectionScreen from './screens/SiteSelectionScreen';
import SubmitReadingScreen from './screens/SubmitReadingScreen';
import ReadingHistoryScreen from './screens/ReadingHistoryScreen';

const initialRoute = {
  name: 'home',
  params: {},
};

export default function NemeXusApp() {
  const { loading, session, profile, authMessage } = useAuth();
  const { palette, statusBar } = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [route, setRoute] = useState(initialRoute);

  useEffect(() => {
    if (!session || !profile) {
      setRoute(initialRoute);
    }
  }, [profile, session]);

  const navigation = useMemo(
    () => ({
      navigate: (name, params = {}) => setRoute({ name, params }),
      reset: () => setRoute(initialRoute),
      goBack: () => {
        setRoute((current) => {
          if (current.name === 'submit-reading') {
            return initialRoute;
          }

          if (current.name === 'reading-history') {
            if (current.params?.source === 'office-dashboard') {
              return {
                name: 'office-dashboard',
                params: {},
              };
            }

            return {
              name: 'submit-reading',
              params: current.params,
            };
          }

          return current;
        });
      },
    }),
    []
  );

  let screen = null;
  const isPrivileged =
    profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'manager';
  const isOperator = profile?.role === 'operator';
  const isApprovedForApp = Boolean(profile?.is_active && (profile?.is_approved || isPrivileged));
  const routeName = route.name === 'home' ? (isPrivileged ? 'office-dashboard' : 'site-selection') : route.name;

  if (!supabaseReady) {
    screen = <SetupRequiredScreen />;
  } else if (loading) {
    screen = <LoadingScreen />;
  } else if (!session || !profile) {
    screen = <AuthScreen initialMessage={authMessage} initialTone={authMessage ? 'error' : 'info'} />;
  } else if (!isApprovedForApp) {
    screen = <PendingApprovalScreen />;
  } else if ((routeName === 'site-selection' || routeName === 'submit-reading') && !isOperator) {
    screen = <OfficeDashboardScreen navigation={navigation} />;
  } else if (routeName === 'office-dashboard') {
    screen = <OfficeDashboardScreen navigation={navigation} />;
  } else if (routeName === 'site-selection') {
    screen = <SiteSelectionScreen navigation={navigation} />;
  } else if (routeName === 'submit-reading') {
    screen = (
      <SubmitReadingScreen
        navigation={navigation}
        site={route.params.site}
      />
    );
  } else if (routeName === 'reading-history') {
    screen = (
      <ReadingHistoryScreen
        navigation={navigation}
        site={route.params.site}
        source={route.params.source}
      />
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'left', 'right']}
    >
      <ExpoStatusBar style={statusBar} />
      <View style={styles.appFrame}>{screen}</View>
    </SafeAreaView>
  );
}

function createStyles(palette) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.appSafeArea,
    },
    appFrame: {
      flex: 1,
      backgroundColor: palette.canvas,
    },
  });
}
