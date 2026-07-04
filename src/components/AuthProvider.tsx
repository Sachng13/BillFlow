"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthCtx {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("auth");
    if (stored) {
      try {
        const { token, user } = JSON.parse(stored);
        setToken(token);
        setUser(user);
      } catch {
        localStorage.removeItem("auth");
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((token: string, user: AuthUser) => {
    localStorage.setItem("auth", JSON.stringify({ token, user }));
    setToken(token);
    setUser(user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("auth");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
