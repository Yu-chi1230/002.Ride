import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { apiFetch } from '../lib/api';

// --- 型定義 ---
export type VehicleData = {
    id: string;
    maker: string;
    model_name: string;
    current_mileage: number | null;
};

export type ProfileData = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    vehicles: VehicleData[];
};

type AuthContextType = {
    user: User | null;
    session: Session | null;
    hasProfile: boolean | null;
    profileData: ProfileData | null;
    isLoading: boolean;
    refreshProfile: () => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    hasProfile: null,
    profileData: null,
    isLoading: true,
    refreshProfile: async () => { },
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [hasProfile, setHasProfile] = useState<boolean | null>(null);
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const checkProfile = async (currentSession: Session | null): Promise<{ hasProfile: boolean | null; data: ProfileData | null }> => {
        console.log('[AuthContext] checkProfile started. Session user:', currentSession?.user?.id);
        if (!currentSession?.user) {
            console.log('[AuthContext] No user in session. Returning null.');
            return { hasProfile: null, data: null };
        }
        try {
            console.log('[AuthContext] fetching /api/users/me...');
            const response = await apiFetch('/api/users/me', {}, currentSession.access_token);
            console.log('[AuthContext] /api/users/me status:', response.status);

            if (response.ok) {
                const result = await response.json();
                console.log('[AuthContext] /api/users/me result:', result);
                return {
                    hasProfile: result.hasProfile === true,
                    data: result.hasProfile === true ? result.data : null,
                };
            } else if (response.status === 401) {
                console.warn('[AuthContext] Session invalid or expired on backend. Signing out to clear stale token.');
                await supabase.auth.signOut();
                return { hasProfile: false, data: null };
            } else {
                console.log('[AuthContext] /api/users/me error response');
                // 404 = no profile, any other error = treat as no profile
                return { hasProfile: false, data: null };
            }
        } catch (error) {
            console.error('[AuthContext] Error fetching profile:', error);
            return { hasProfile: false, data: null };
        }
    };

    const refreshProfile = async () => {
        const result = await checkProfile(session);
        setHasProfile(result.hasProfile);
        setProfileData(result.data);
    };

    useEffect(() => {
        let isMounted = true;
        let isInitialized = false;

        const initializeAuth = async (currentSession: Session | null) => {
            if (!isMounted) return;
            isInitialized = true;

            setSession(currentSession);
            setUser(currentSession?.user ?? null);

            if (currentSession?.user) {
                // User is logged in, check profile and fetch data
                const profileResult = await checkProfile(currentSession);
                if (isMounted) {
                    setHasProfile(profileResult.hasProfile);
                    setProfileData(profileResult.data);
                    setIsLoading(false);
                }
            } else {
                // No user (logged out or no session)
                setHasProfile(null);
                setProfileData(null);
                setIsLoading(false);
            }
        };

        // Explicit getSession call in case onAuthStateChange is delayed or doesn't fire INITIAL_SESSION
        supabase.auth.getSession().then(({ data: { session }, error }) => {
            if (error) {
                console.error('[AuthContext] getSession error:', error.message);
            }
            if (!isInitialized) {
                console.log('[AuthContext] getSession resolved before onAuthStateChange');
                initializeAuth(session);
            }
        });

        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (event, newSession) => {
                if (!isMounted) return;

                console.log(`[AuthContext] onAuthStateChange event: ${event}`);

                if (event === 'INITIAL_SESSION' && isInitialized) {
                    return; // Already initialized by getSession
                }

                if (!isInitialized || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                    await initializeAuth(newSession);
                }
            }
        );

        return () => {
            isMounted = false;
            authListener?.subscription.unsubscribe();
        };
    }, []);

    const value = {
        user,
        session,
        hasProfile,
        profileData,
        isLoading,
        refreshProfile,
        signOut: async () => { await supabase.auth.signOut(); },
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
