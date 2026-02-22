import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { apiFetch } from '../lib/api';

type AuthContextType = {
    user: User | null;
    session: Session | null;
    hasProfile: boolean | null;
    isLoading: boolean;
    refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    hasProfile: null,
    isLoading: true,
    refreshProfile: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [hasProfile, setHasProfile] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const checkProfile = async (currentUser: User | null) => {
        if (!currentUser) {
            setHasProfile(null);
            return;
        }
        try {
            const response = await apiFetch('/api/users/me');
            if (response.ok) {
                const result = await response.json();
                setHasProfile(result.hasProfile);
            } else if (response.status === 404) {
                setHasProfile(false);
            } else {
                setHasProfile(false);
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            setHasProfile(false);
        }
    };

    const refreshProfile = async () => {
        await checkProfile(user);
    };

    useEffect(() => {
        let isMounted = true;

        const getInitialSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) {
                    console.error('Error fetching session:', error.message);
                }
                if (isMounted) {
                    setSession(session);
                    setUser(session?.user ?? null);
                    await checkProfile(session?.user ?? null);
                }
            } catch (error) {
                console.error('Unexpected error fetching session:', error);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        getInitialSession();

        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (_event, newSession) => {
                if (isMounted) {
                    setSession(newSession);
                    setUser(newSession?.user ?? null);
                    await checkProfile(newSession?.user ?? null);
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
        isLoading,
        refreshProfile,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
