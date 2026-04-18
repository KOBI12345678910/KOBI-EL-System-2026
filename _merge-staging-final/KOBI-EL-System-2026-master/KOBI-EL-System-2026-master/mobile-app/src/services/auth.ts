import * as SecureStore from 'expo-secure-store';
import { useAppStore } from '../store/useAppStore';

const TOKEN_KEY = 'techno_kol_token';
const USER_KEY = 'techno_kol_user';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3100';

export async function login(username: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'שגיאה בהתחברות' }));
    throw new Error(error.message || 'שגיאה בהתחברות');
  }

  const data = await response.json();
  const { token, user } = data;

  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

  useAppStore.getState().setAuth(user, token);
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  useAppStore.getState().logout();
}

export async function getToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function restoreSession(): Promise<boolean> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const userJson = await SecureStore.getItemAsync(USER_KEY);

    if (token && userJson) {
      const user = JSON.parse(userJson);
      useAppStore.getState().setAuth(user, token);
      return true;
    }
  } catch {
    // session restore failed
  }
  return false;
}
