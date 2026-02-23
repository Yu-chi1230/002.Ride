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
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    hasProfile: null,
    profileData: null,
    isLoading: true,
    refreshProfile: async () => { },
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

        // Use onAuthStateChange as the single source of truth for session state.
        // It fires INITIAL_SESSION on mount, so we don't need a separate getSession call.
        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (_event, newSession) => {
                if (!isMounted) return;

                setSession(newSession);
                setUser(newSession?.user ?? null);

                if (newSession?.user) {
                    // User is logged in, check profile and fetch data
                    const profileResult = await checkProfile(newSession);
                    if (isMounted) {
                        setHasProfile(profileResult.hasProfile);
                        setProfileData(profileResult.data);
                        setIsLoading(false);
                    }
                } else {
                    // No user (logged out or initial with no session)
                    setHasProfile(null);
                    setProfileData(null);
                    setIsLoading(false);
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
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
