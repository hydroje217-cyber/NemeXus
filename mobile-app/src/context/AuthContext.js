import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { supabase, supabaseReady } from '../lib/supabase';

const AuthContext = createContext(null);

function getPasswordResetRedirectUrl() {
  if (Platform.OS === 'web') {
    return ExpoLinking.createURL('reset-password');
  }

  return 'nemexus://reset-password';
}

function readRecoveryParams(url) {
  if (!url) {
    return {};
  }

  const parsed = ExpoLinking.parse(url);
  const fragment = typeof parsed.fragment === 'string' ? parsed.fragment : '';
  const hashParams = new URLSearchParams(fragment);
  const queryParams = parsed.queryParams || {};

  return {
    accessToken: hashParams.get('access_token') || queryParams.access_token || '',
    refreshToken: hashParams.get('refresh_token') || queryParams.refresh_token || '',
    type: hashParams.get('type') || queryParams.type || '',
    errorCode: hashParams.get('error_code') || queryParams.error_code || '',
    errorDescription:
      hashParams.get('error_description') || queryParams.error_description || '',
  };
}

async function ensureProfile(user) {
  if (!supabase || !user) {
    return null;
  }

  let query = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, is_approved, approved_at, approved_by')
    .eq('id', user.id)
    .maybeSingle();

  if (query.error) {
    throw query.error;
  }

  if (!query.data) {
    const upsert = await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Operator',
      },
      { onConflict: 'id' }
    );

    if (upsert.error) {
      throw upsert.error;
    }

    query = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, is_approved, approved_at, approved_by')
      .eq('id', user.id)
      .maybeSingle();

    if (query.error) {
      throw query.error;
    }
  }

  return query.data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState('');
  const [pendingApprovalMessage, setPendingApprovalMessage] = useState('');

  function clearAuthState(nextMessage = '') {
    setSession(null);
    setProfile(null);
    setLoading(false);
    setAuthMessage(nextMessage);
    setPendingApprovalMessage('');
  }

  useEffect(() => {
    if (!supabaseReady || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function bootstrap() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) {
        return;
      }

      if (error) {
        setAuthMessage(error.message);
        setLoading(false);
        return;
      }

      setSession(data.session ?? null);

      if (data.session?.user) {
        try {
          const nextProfile = await ensureProfile(data.session.user);
          if (mounted) {
            setProfile(nextProfile);
            setAuthMessage('');
          }
        } catch (profileError) {
          if (mounted) {
            setAuthMessage(profileError.message || 'Failed to load profile.');
            setProfile(null);
          }
        }
      } else {
        setProfile(null);
      }

      setLoading(false);
    }

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) {
        return;
      }

      setSession(nextSession ?? null);

      if (nextSession?.user) {
        try {
          const nextProfile = await ensureProfile(nextSession.user);
          if (mounted) {
            setProfile(nextProfile);
            setAuthMessage('');
          }
        } catch (profileError) {
          if (mounted) {
            setAuthMessage(profileError.message || 'Failed to load profile.');
            setProfile(null);
          }
        }
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      profile,
      user: session?.user ?? null,
      loading,
      authMessage,
      setAuthMessage,
      pendingApprovalMessage,
      clearPendingApprovalMessage() {
        setPendingApprovalMessage('');
      },
      async signIn({ email, password }) {
        if (!supabase) {
          return { ok: false, message: 'Supabase is not configured yet.' };
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return { ok: false, message: error.message };
        }

        setPendingApprovalMessage('');
        return { ok: true, message: 'Signed in successfully.' };
      },
      async signUp({ email, password, fullName }) {
        if (!supabase) {
          return { ok: false, message: 'Supabase is not configured yet.' };
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) {
          return { ok: false, message: error.message };
        }

        setPendingApprovalMessage('Registered successfully. Your account is waiting for office approval.');

        if (!data.session) {
          return {
            ok: true,
            message: 'Account created. Ask the office to approve your account in the dashboard before signing in.',
          };
        }

        return {
          ok: true,
          message: 'Account created successfully. Office approval is still required before app access.',
        };
      },
      async requestPasswordReset({ email }) {
        if (!supabase) {
          return { ok: false, message: 'Supabase is not configured yet.' };
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getPasswordResetRedirectUrl(),
        });

        if (error) {
          return { ok: false, message: error.message };
        }

        return {
          ok: true,
          message: 'Password reset email sent. Open the link to choose a new password.',
        };
      },
      async recoverSessionFromUrl(url) {
        if (!supabase) {
          return { ok: false, isRecovery: false, message: 'Supabase is not configured yet.' };
        }

        const recovery = readRecoveryParams(url);
        const isRecovery = recovery.type === 'recovery';

        if (!isRecovery) {
          return { ok: false, isRecovery: false, message: '' };
        }

        if (recovery.errorDescription) {
          return {
            ok: false,
            isRecovery: true,
            message: decodeURIComponent(recovery.errorDescription).replace(/\+/g, ' '),
          };
        }

        if (!recovery.accessToken || !recovery.refreshToken) {
          return {
            ok: false,
            isRecovery: true,
            message: 'This password reset link is incomplete or invalid.',
          };
        }

        const { error } = await supabase.auth.setSession({
          access_token: recovery.accessToken,
          refresh_token: recovery.refreshToken,
        });

        if (error) {
          return { ok: false, isRecovery: true, message: error.message || 'Invalid reset link.' };
        }

        return { ok: true, isRecovery: true, message: '' };
      },
      async updatePassword({ password }) {
        if (!supabase) {
          return { ok: false, message: 'Supabase is not configured yet.' };
        }

        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
          return { ok: false, message: error.message };
        }

        return { ok: true, message: 'Password updated successfully.' };
      },
      async signOut() {
        if (!supabase) {
          clearAuthState('');
          return { ok: true, message: 'Signed out.' };
        }

        const { error } = await supabase.auth.signOut();

        if (error) {
          return { ok: false, message: error.message || 'Failed to sign out.' };
        }

        clearAuthState('Signed out successfully.');
        return { ok: true, message: 'Signed out successfully.' };
      },
      async refreshProfile() {
        if (!session?.user) {
          return;
        }

        try {
          const nextProfile = await ensureProfile(session.user);
          setProfile(nextProfile);
          setAuthMessage('');
        } catch (profileError) {
          setAuthMessage(profileError.message || 'Failed to refresh profile.');
        }
      },
    }),
    [authMessage, loading, pendingApprovalMessage, profile, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return value;
}
