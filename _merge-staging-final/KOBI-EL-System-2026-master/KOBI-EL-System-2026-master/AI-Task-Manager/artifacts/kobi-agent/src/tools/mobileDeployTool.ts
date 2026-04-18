import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile } from "./fileTool";
import { runCommand } from "./terminalTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function setupExpo(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n📱 מגדיר Expo...");

  const create = await runCommand({
    command: `cd ${WORKSPACE} && npx create-expo-app@latest mobile --template blank-typescript`,
    timeout: 180000,
  });

  if (create.stderr && create.stderr.includes("error")) {
    return { success: false, output: `שגיאה ביצירת פרויקט Expo: ${create.stderr}` };
  }

  await runCommand({
    command: `cd ${WORKSPACE}/mobile && npx expo install expo-router expo-linking expo-constants expo-status-bar react-native-safe-area-context react-native-screens`,
    timeout: 120000,
  });

  const appJson = JSON.stringify({
    expo: {
      name: "KobiApp",
      slug: "kobi-app",
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "automatic",
      splash: { image: "./assets/splash.png", resizeMode: "contain", backgroundColor: "#0d1117" },
      ios: { supportsTablet: true, bundleIdentifier: "com.kobi.app" },
      android: { adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#0d1117" }, package: "com.kobi.app" },
      web: { favicon: "./assets/favicon.png" },
      plugins: ["expo-router"],
      scheme: "kobi-app",
    },
  }, null, 2);

  await writeFile({ path: `${WORKSPACE}/mobile/app.json`, content: appJson });

  return { success: true, output: "📱 Expo project created successfully with expo-router" };
}

export async function generateMobileScreen(params: {
  name: string;
  description: string;
}): Promise<{ success: boolean; output: string; code?: string }> {
  console.log(`\n📱 מייצר מסך: ${params.name}...`);

  const response = await callLLM({
    system: `Generate a React Native (Expo) screen component with TypeScript.
Rules:
- Use React Native components (View, Text, ScrollView, TouchableOpacity, FlatList, etc.)
- Use StyleSheet for styling (NOT Tailwind — React Native doesn't support it)
- Include SafeAreaView
- Handle both iOS and Android
- Include loading and error states
- Make it look modern and clean
- Use proper navigation typing

Respond with ONLY the complete TSX code.`,
    messages: [{ role: "user", content: `Screen "${params.name}": ${params.description}` }],
    maxTokens: 4096,
  });

  let code = extractTextContent(response.content);
  code = code.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const filePath = `${WORKSPACE}/mobile/app/${params.name.toLowerCase()}.tsx`;
  await writeFile({ path: filePath, content: code });

  return { success: true, output: `📱 מסך ${params.name} נוצר: ${filePath}`, code };
}

export async function buildForPlatform(params: {
  platform: string;
}): Promise<{ success: boolean; output: string; buildUrl?: string }> {
  console.log(`\n📱 בונה ל-${params.platform}...`);

  let command: string;
  switch (params.platform) {
    case "ios":
      command = `cd ${WORKSPACE}/mobile && npx eas build --platform ios --non-interactive`;
      break;
    case "android":
      command = `cd ${WORKSPACE}/mobile && npx eas build --platform android --non-interactive`;
      break;
    case "web":
      command = `cd ${WORKSPACE}/mobile && npx expo export --platform web`;
      break;
    default:
      return { success: false, output: `פלטפורמה לא נתמכת: ${params.platform}. השתמש ב-ios, android, או web` };
  }

  const result = await runCommand({ command, timeout: 600000 });
  const urlMatch = result.stdout.match(/https:\/\/expo\.dev\/.*\/builds\/.*/);

  return {
    success: !result.stderr?.includes("error"),
    output: `📱 Build ${params.platform}:\n${result.stdout.slice(-500)}${result.stderr ? `\n${result.stderr.slice(-300)}` : ""}`,
    buildUrl: urlMatch?.[0],
  };
}

export async function setupEAS(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n📱 מגדיר EAS Build...");

  await runCommand({ command: "npm install -g eas-cli", timeout: 30000 });

  const easJson = JSON.stringify({
    cli: { version: ">= 12.0.0" },
    build: {
      development: { developmentClient: true, distribution: "internal" },
      preview: { distribution: "internal" },
      production: { autoIncrement: true },
    },
    submit: {
      production: {
        ios: { appleId: "your@email.com", ascAppId: "YOUR_APP_ID", appleTeamId: "YOUR_TEAM_ID" },
        android: { serviceAccountKeyPath: "./google-services.json", track: "production" },
      },
    },
  }, null, 2);

  await writeFile({ path: `${WORKSPACE}/mobile/eas.json`, content: easJson });

  return { success: true, output: "📱 EAS Build configured — עדכן את פרטי Apple/Google ב-eas.json" };
}

export async function setupPushNotifications(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n📱 מגדיר Push Notifications...");

  const install = await runCommand({
    command: `cd ${WORKSPACE}/mobile && npx expo install expo-notifications expo-device expo-constants`,
    timeout: 60000,
  });

  const notifCode = `import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (!Device.isDevice) {
    console.log('Must use physical device for Push Notifications');
    return undefined;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Failed to get push token');
    return undefined;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return token;
}

export async function sendPushNotification(expoPushToken: string, title: string, body: string): Promise<void> {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: expoPushToken, sound: 'default', title, body }),
  });
}
`;

  await runCommand({ command: `mkdir -p ${WORKSPACE}/mobile/utils`, timeout: 5000 });
  await writeFile({ path: `${WORKSPACE}/mobile/utils/notifications.ts`, content: notifCode });

  return { success: true, output: "📱 Push Notifications configured — utils/notifications.ts" };
}

export const MOBILE_DEPLOY_TOOLS = [
  {
    name: "setup_expo",
    description: "הקמת פרויקט Expo + expo-router + TypeScript",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "generate_mobile_screen",
    description: "יצירת מסך React Native עם AI — StyleSheet, SafeAreaView, loading/error",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "שם המסך" },
        description: { type: "string", description: "תיאור המסך" },
      },
      required: ["name", "description"] as string[],
    },
  },
  {
    name: "build_for_platform",
    description: "בניית אפליקציה — iOS, Android, או Web",
    input_schema: {
      type: "object" as const,
      properties: {
        platform: { type: "string", description: "ios | android | web" },
      },
      required: ["platform"] as string[],
    },
  },
  {
    name: "setup_eas",
    description: "הגדרת EAS Build — development, preview, production",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "setup_push_notifications",
    description: "הגדרת Push Notifications — expo-notifications + helper functions",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
