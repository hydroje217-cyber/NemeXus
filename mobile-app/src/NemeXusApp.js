import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { supabaseReady } from './lib/supabase';
import { isRecoveryUrl } from './utils/authRecovery';
import AuthScreen from './screens/AuthScreen';
import LoadingScreen from './screens/LoadingScreen';
import OfficeDashboardScreen from './screens/OfficeDashboardScreen';
import OfficeGraphsScreen from './screens/OfficeGraphsScreen';
import PendingApprovalScreen from './screens/PendingApprovalScreen';
import SetupRequiredScreen from './screens/SetupRequiredScreen';
import SiteSelectionScreen from './screens/SiteSelectionScreen';
import SubmitReadingScreen from './screens/SubmitReadingScreen';
import ReadingHistoryScreen from './screens/ReadingHistoryScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';

const initialRoute = {
  name: 'home',
  params: {},
};

function getBackRoute(route) {
  if (route.name === 'reset-password') {
    return initialRoute;
  }

  if (route.name === 'submit-reading') {
    return {
      name: 'site-selection',
      params: {},
    };
  }

  if (route.name === 'reading-history') {
    if (route.params?.source === 'office-dashboard') {
      return {
        name: 'office-dashboard',
        params: {},
      };
    }

    return {
      name: 'site-selection',
      params: {},
    };
  }

  if (route.name === 'office-graphs') {
    return {
      name: 'office-dashboard',
      params: {},
    };
  }

  return null;
}

export default function NemeXusApp() {
  const {
    loading,
    session,
    profile,
    authMessage,
    passwordRecovery,
    clearPasswordRecovery,
    recoverSessionFromUrl,
  } = useAuth();
  const { palette, statusBar } = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [route, setRoute] = useState(initialRoute);
  const [resetMessage, setResetMessage] = useState('');
  const [resetTone, setResetTone] = useState('info');

  useEffect(() => {
    if ((!session || !profile) && route.name !== 'reset-password') {
      setRoute(initialRoute);
    }
  }, [profile, route.name, session]);

  useEffect(() => {
    if (!passwordRecovery?.active) {
      return;
    }

    setResetMessage(passwordRecovery.message || '');
    setResetTone(passwordRecovery.tone || 'info');
    setRoute({ name: 'reset-password', params: {} });
  }, [passwordRecovery]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const backRoute = getBackRoute(route);

      if (!backRoute) {
        return false;
      }

      setRoute(backRoute);
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [route]);

  useEffect(() => {
    let mounted = true;

    async function handleRecoveryUrl(url) {
      if (!url) {
        return;
      }

      if (isRecoveryUrl(url)) {
        setResetMessage('');
        setResetTone('info');
        setRoute({ name: 'reset-password', params: {} });
      }

      const result = await recoverSessionFromUrl(url);
      if (!mounted || !result.isRecovery) {
        return;
      }

      setResetMessage(result.message || '');
      setResetTone(result.ok ? 'info' : 'error');
      setRoute({ name: 'reset-password', params: {} });
    }

    ExpoLinking.getInitialURL().then(handleRecoveryUrl);

    const subscription = ExpoLinking.addEventListener('url', ({ url }) => {
      handleRecoveryUrl(url);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [recoverSessionFromUrl]);

  const navigation = useMemo(
    () => ({
      navigate: (name, params = {}) => setRoute({ name, params }),
      reset: () => setRoute(initialRoute),
      finishPasswordReset: () => {
        clearPasswordRecovery();
        setRoute(initialRoute);
      },
      goBack: () => {
        setRoute((current) => {
          return getBackRoute(current) || current;
        });
      },
    }),
    [clearPasswordRecovery]
  );

  let screen = null;
  const isPrivileged =
    profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'manager';
  const isOperator = profile?.role === 'operator';
  const isApprovedForApp = Boolean(profile?.is_active && (profile?.is_approved || isPrivileged));
  const routeName = route.name === 'home' ? (isPrivileged ? 'office-dashboard' : 'site-selection') : route.name;

  if (!supabaseReady) {
    screen = <SetupRequiredScreen />;
  } else if (route.name === 'reset-password') {
    screen = (
      <ResetPasswordScreen
        navigation={navigation}
        initialMessage={resetMessage}
        initialTone={resetTone}
      />
    );
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
  } else if (routeName === 'office-graphs' && isPrivileged) {
    screen = <OfficeGraphsScreen navigation={navigation} />;
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
