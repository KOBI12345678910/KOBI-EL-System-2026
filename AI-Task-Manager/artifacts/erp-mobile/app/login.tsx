import { Feather } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBiometric } from "@/contexts/BiometricContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE, setStoredToken, getStoredToken } from "@/lib/api";
import { GPS_PERMISSION_SHOWN_KEY } from "@/app/gps-permission";
import AsyncStorage from "@react-native-async-storage/async-storage";

WebBrowser.maybeCompleteAuthSession();

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: unknown) => void;
          renderButton: (el: HTMLElement, config: unknown) => void;
        };
      };
    };
  }
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, refreshUser } = useAuth();
  const { colors } = useTheme();
  const { isBiometricAvailable, isBiometricEnabled, biometricType, authenticateWithBiometric } = useBiometric();

  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const googleBtnRef = useRef<View>(null);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: "erp-mobile" });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleClientId ?? "placeholder",
      scopes: ["openid", "email", "profile"],
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      usePKCE: false,
    },
    { authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth" }
  );

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאת התחברות Google");
        return;
      }
      if (data.token) {
        await setStoredToken(data.token);
        await refreshUser();
      }
      const dest = Platform.OS !== "web"
        ? ((await AsyncStorage.getItem(GPS_PERMISSION_SHOWN_KEY)) ? "/(tabs)" : "/gps-permission")
        : "/(tabs)";
      router.replace(dest as "/(tabs)");
    } catch {
      setError("שגיאת תקשורת עם השרת");
    } finally {
      setLoading(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    fetch(`${API_BASE}/auth/google/client-id`)
      .then(r => r.json())
      .then(data => {
        if (data.clientId) setGoogleClientId(data.clientId);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || !googleClientId || mode !== "login") return;
    if (response?.type === "success" && response.params?.id_token) {
      handleGoogleCredential(response.params.id_token);
    } else if (response?.type === "error") {
      setError("שגיאה בהתחברות עם Google");
    }
  }, [response, googleClientId, handleGoogleCredential, mode]);

  useEffect(() => {
    if (Platform.OS !== "web" || !googleClientId || mode !== "login") return;

    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      initGoogleBtn();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => initGoogleBtn();
    document.head.appendChild(script);

    function initGoogleBtn() {
      setTimeout(() => {
        if (window.google) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (res: { credential: string }) => handleGoogleCredential(res.credential),
          });
          const el = document.getElementById("google-signin-btn-mobile");
          if (el) {
            window.google.accounts.id.renderButton(el, {
              theme: "outline",
              size: "large",
              width: "100%",
              text: "signin_with",
              locale: "he",
            });
          }
        }
      }, 200);
    }
  }, [googleClientId, handleGoogleCredential, mode]);

  const getPostLoginRoute = async (): Promise<"/(tabs)" | "/gps-permission"> => {
    if (Platform.OS === "web") return "/(tabs)";
    try {
      const shown = await AsyncStorage.getItem(GPS_PERMISSION_SHOWN_KEY);
      if (!shown) return "/gps-permission";
    } catch {
    }
    return "/(tabs)";
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("נא למלא שם משתמש וסיסמה");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      const dest = await getPostLoginRoute();
      router.replace(dest as never);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "שגיאה בהתחברות");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!isBiometricAvailable || !isBiometricEnabled) return;
    setBiometricLoading(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const storedToken = await getStoredToken();
      if (!storedToken) {
        setError("אין טוקן שמור — נא להתחבר עם שם משתמש וסיסמה תחילה");
        return;
      }
      const authenticated = await authenticateWithBiometric("אמת את זהותך לכניסה למערכת");
      if (!authenticated) {
        setError("הזדהות ביומטרית נכשלה");
        return;
      }
      await refreshUser();
      if (!router.canGoBack()) {
        router.replace("/(tabs)");
      }
    } catch {
      setError("שגיאה בזיהוי ביומטרי");
    } finally {
      setBiometricLoading(false);
    }
  };

  const handleNativeGoogleLogin = async () => {
    if (!googleClientId) return;
    setError("");
    await promptAsync();
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setError("נא להזין כתובת מייל");
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשליחת בקשה");
        return;
      }
      setSuccess(data.message || "אם המייל קיים במערכת, נשלחה סיסמה חדשה אליו");
    } catch {
      setError("שגיאת תקשורת עם השרת");
    } finally {
      setLoading(false);
    }
  };

  const biometricIconName: keyof typeof Feather.glyphMap =
    biometricType === "facial" ? "eye" : "lock";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 40,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20,
        },
      ]}
    >
      <View style={styles.logoContainer}>
        <View style={[styles.logoIcon, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
          <Feather name="briefcase" size={36} color="#fff" />
        </View>
        <Text style={[styles.logoTitle, { color: colors.text }]}>ERP Mobile</Text>
        <Text style={[styles.logoSubtitle, { color: colors.textSecondary }]}>מערכת ניהול ארגונית</Text>
      </View>

      <View style={styles.formContainer}>
        {!!error && (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={16} color="#dc2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {!!success && (
          <View style={styles.successBanner}>
            <Feather name="check-circle" size={16} color="#22c55e" />
            <Text style={styles.successText}>{success}</Text>
          </View>
        )}

        {mode === "login" ? (
          <>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>שם משתמש</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
                <Feather
                  name="user"
                  size={18}
                  color={colors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="הזן שם משתמש"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  editable={!loading}
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>סיסמה</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
                <Feather
                  name="lock"
                  size={18}
                  color={colors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="הזן סיסמה"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!loading}
                  textAlign="right"
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={8}
                  style={styles.eyeBtn}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.loginBtn,
                { backgroundColor: colors.primary, shadowColor: colors.primary },
                pressed && styles.loginBtnPressed,
                loading && styles.loginBtnDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.loginBtnText}>התחבר</Text>
              )}
            </Pressable>

            {isBiometricAvailable && isBiometricEnabled && Platform.OS !== "web" && (
              <Pressable
                style={({ pressed }) => [
                  styles.biometricBtn,
                  { borderColor: colors.primary, backgroundColor: colors.primary + "0D" },
                  pressed && { opacity: 0.8 },
                  biometricLoading && styles.loginBtnDisabled,
                ]}
                onPress={handleBiometricLogin}
                disabled={biometricLoading || loading}
              >
                {biometricLoading ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <>
                    <Feather name={biometricIconName} size={20} color={colors.primary} />
                    <Text style={[styles.biometricBtnText, { color: colors.primary }]}>
                      {biometricType === "facial" ? "כניסה עם זיהוי פנים" : "כניסה עם טביעת אצבע"}
                    </Text>
                  </>
                )}
              </Pressable>
            )}

            {googleClientId && (
              <>
                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.textMuted }]}>או</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                {Platform.OS === "web" ? (
                  <View
                    ref={googleBtnRef}
                    id="google-signin-btn-mobile"
                    style={styles.googleBtnContainer}
                  />
                ) : (
                  <Pressable
                    style={({ pressed }) => [
                      styles.googleNativeBtn,
                      { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                      pressed && styles.loginBtnPressed,
                      (!request || loading) && styles.loginBtnDisabled,
                    ]}
                    onPress={handleNativeGoogleLogin}
                    disabled={!request || loading}
                  >
                    <Feather name="globe" size={20} color={colors.text} style={{ marginRight: 8 }} />
                    <Text style={[styles.googleNativeBtnText, { color: colors.text }]}>כניסה עם Google</Text>
                  </Pressable>
                )}
              </>
            )}

            <Pressable onPress={() => { setMode("forgot"); setError(""); setSuccess(""); }} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.primary }]}>שכחתי סיסמה</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.forgotDesc, { color: colors.textSecondary }]}>הזן את כתובת המייל שלך ונשלח אליך סיסמה חדשה.</Text>

            {!success && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>כתובת מייל</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
                    <Feather
                      name="mail"
                      size={18}
                      color={colors.textMuted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={[styles.input, { color: colors.text, textAlign: "left" }]}
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      placeholder="your@email.com"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="send"
                      onSubmitEditing={handleForgotPassword}
                      editable={!loading}
                    />
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.loginBtn,
                    { backgroundColor: "#7c3aed", shadowColor: "#7c3aed" },
                    pressed && styles.loginBtnPressed,
                    loading && styles.loginBtnDisabled,
                  ]}
                  onPress={handleForgotPassword}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.loginBtnText}>שלח סיסמה חדשה</Text>
                  )}
                </Pressable>
              </>
            )}

            <Pressable onPress={() => { setMode("login"); setError(""); setSuccess(""); setForgotEmail(""); }} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.primary }]}>חזרה להתחברות</Text>
            </Pressable>
          </>
        )}
      </View>

      <Text style={[styles.footerText, { color: colors.textMuted }]}>גרסה 1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  logoContainer: {
    alignItems: "center",
    gap: 12,
    marginTop: 40,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginTop: 8,
  },
  logoSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  formContainer: {
    gap: 16,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FDE8EA",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#dc2626",
    textAlign: "right",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  successText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#15803d",
    textAlign: "right",
  },
  forgotDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  eyeBtn: {
    padding: 4,
  },
  loginBtn: {
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  biometricBtn: {
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 10,
  },
  biometricBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  googleBtnContainer: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  googleNativeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    height: 52,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  googleNativeBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textDecorationLine: "underline",
  },
  footerText: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
});
