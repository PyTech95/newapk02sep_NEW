import { useRouter, useSegments } from "expo-router";
import React, { createContext, useContext, useEffect, useState } from "react";

import { setUnauthorizedHandler, TOKEN_KEY } from "@/src/api/client";
import { getMe, login as apiLogin, otpVerify as apiOtpVerify, register as apiRegister } from "@/src/api/endpoints";
import { AuthResponse, User } from "@/src/api/types";
import { storage } from "@/src/utils/storage";

interface AuthContextValue {
  user: User | null;
  bootstrapping: boolean;
  setSession: (res: AuthResponse) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<void>;
  verifyOtp: (phone: string, code: string, name?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  const setSession = async (res: AuthResponse) => {
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUser(res.user);
  };

  const login = async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    await setSession(res);
  };

  const register = async (name: string, email: string, phone: string, password: string) => {
    const res = await apiRegister(name, email, phone, password);
    await setSession(res);
  };

  const verifyOtp = async (phone: string, code: string, name?: string) => {
    const res = await apiOtpVerify(phone, code, name);
    await setSession(res);
  };

  const refreshUser = async () => {
    const me = await getMe();
    setUser(me);
  };

  const logout = async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  };

  // Force logout when any request returns 401.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  // On cold start, restore session if a token exists.
  useEffect(() => {
    (async () => {
      const token = await storage.secureGet(TOKEN_KEY, "");
      if (token) {
        try {
          const me = await getMe();
          setUser(me);
        } catch {
          await storage.secureRemove(TOKEN_KEY);
        }
      }
      setBootstrapping(false);
    })();
  }, []);

  // Route guard: keep unauthenticated users in (auth), authenticated in (tabs).
  useEffect(() => {
    if (bootstrapping) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) {
      router.replace("/(auth)/login");
    } else if (user && inAuth) {
      router.replace("/(tabs)");
    }
  }, [user, segments, bootstrapping]);

  return (
    <AuthContext.Provider
      value={{ user, bootstrapping, setSession, login, register, verifyOtp, refreshUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
