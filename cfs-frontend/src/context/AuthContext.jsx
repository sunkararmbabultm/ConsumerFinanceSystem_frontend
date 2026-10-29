import { useEffect, useState } from "react";
import { loginCustomer, normalizeSession } from "../services/authService";
import AuthContext from "./authContext";

function readStoredSession() {
  for (const storage of [sessionStorage, localStorage]) {
    const token = storage.getItem("cfs-token");
    const tokenType = storage.getItem("cfs-token-type") || "Bearer";
    const user = storage.getItem("cfs-user");
    if (token && user) {
      try {
        return { token, tokenType, user: JSON.parse(user) };
      } catch {
        storage.removeItem("cfs-token");
        storage.removeItem("cfs-token-type");
        storage.removeItem("cfs-user");
      }
    }
  }
  return null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession);

  useEffect(() => {
    const clearSession = () => setSession(null);
    window.addEventListener("cfs:unauthorized", clearSession);
    return () => window.removeEventListener("cfs:unauthorized", clearSession);
  }, []);

  async function login(credentials, remember) {
    const result = normalizeSession(await loginCustomer(credentials));
    const storage = remember ? localStorage : sessionStorage;
    const otherStorage = remember ? sessionStorage : localStorage;
    otherStorage.removeItem("cfs-token");
    otherStorage.removeItem("cfs-token-type");
    otherStorage.removeItem("cfs-user");
    storage.setItem("cfs-token", result.token);
    storage.setItem("cfs-token-type", result.tokenType);
    storage.setItem("cfs-user", JSON.stringify(result.user));
    setSession(result);
    return result.user;
  }

  function logout() {
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem("cfs-token");
      storage.removeItem("cfs-token-type");
      storage.removeItem("cfs-user");
    }
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ user: session?.user || null, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
