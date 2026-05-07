import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as ExpoLinking from 'expo-linking';
import { supabase, supabaseReady } from '../lib/supabase';
import { isRecoveryUrl, readRecoveryParams } from '../utils/authRecovery';

const AuthContext = createContext(null);

function getPasswordResetRedirectUrl() {
  return ExpoLinking.createURL('reset-password');
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
  const [passwordRecovery, setPasswordRecovery] = useState({
    active: false,
    message: '',
    tone: 'info',
  });

  function clearAuthState(nextMessage = '') {
    setSession(null);
    setProfile(null);
    setLoading(false);
    setAuthMessage(nextMessage);
    setPendingApprovalMessage('');
    setPasswordRecovery({ active: false, message: '', tone: 'info' });
  }

  const recoverSessionFromUrl = useCallback(async (url) => {
    if (!supabase) {
      return { ok: false, isRecovery: false, message: 'Supabase is not configured yet.' };
    }

    const recovery = readRecoveryParams(url);
    const isRecovery = isRecoveryUrl(url);

    if (!isRecovery) {
      return { ok: false, isRecovery: false, message: '' };
    }

    setPasswordRecovery({ active: true, message: '', tone: 'info' });

    if (recovery.errorDescription) {
      const message = decodeURIComponent(recovery.errorDescription).replace(/\+/g, ' ');
      setPasswordRecovery({ active: true, message, tone: 'error' });
      return {
        ok: false,
        isRecovery: true,
        message,
      };
    }

    if (recovery.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(recovery.code);

      if (error) {
        const message = error.message || 'Invalid reset link.';
        setPasswordRecovery({ active: true, message, tone: 'error' });
        return { ok: false, isRecovery: true, message };
      }

      return { ok: true, isRecovery: true, message: '' };
    }

    if (recovery.tokenHash) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: recovery.tokenHash,
        type: 'recovery',
      });

      if (error) {
        const message = error.message || 'Invalid reset link.';
        setPasswordRecovery({ active: true, message, tone: 'error' });
        return { ok: false, isRecovery: true, message };
      }

      return { ok: true, isRecovery: true, message: '' };
    }

    if (!recovery.accessToken || !recovery.refreshToken) {
      const message = 'This password reset link is incomplete or invalid.';
      setPasswordRecovery({ active: true, message, tone: 'error' });
      return {
        ok: false,
        isRecovery: true,
        message,
      };
    }

    const { error } = await supabase.auth.setSession({
      access_token: recovery.accessToken,
      refresh_token: recovery.refreshToken,
    });

    if (error) {
      const message = error.message || 'Invalid reset link.';
      setPasswordRecovery({ active: true, message, tone: 'error' });
      return { ok: false, isRecovery: true, message };
    }

    return { ok: true, isRecovery: true, message: '' };
  }, []);

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

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) {
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery({ active: true, message: '', tone: 'info' });
      }

      setSession(nextSession ?? null);

      if (!nextSession?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      setTimeout(() => {
        async function loadProfileAfterAuthChange() {
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
          } finally {
            if (mounted) {
              setLoading(false);
            }
          }
        }

        loadProfileAfterAuthChange();
      }, 0);
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
      passwordRecovery,
      clearPasswordRecovery() {
        setPasswordRecovery({ active: false, message: '', tone: 'info' });
      },
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
      recoverSessionFromUrl,
      async updatePassword({ password }) {
        if (!supabase) {
          return { ok: false, message: 'Supabase is not configured yet.' };
        }

        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
          return { ok: false, message: error.message };
        }

        setPasswordRecovery({ active: false, message: '', tone: 'info' });
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
    [authMessage, loading, passwordRecovery, pendingApprovalMessage, profile, recoverSessionFromUrl, session]
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
