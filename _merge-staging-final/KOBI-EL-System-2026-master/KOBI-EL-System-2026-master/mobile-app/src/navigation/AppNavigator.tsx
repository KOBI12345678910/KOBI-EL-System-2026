import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { colors, fontSize } from '../constants/theme';

// Screens
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import WorkOrdersScreen from '../screens/WorkOrdersScreen';
import WorkOrderDetailScreen from '../screens/WorkOrderDetailScreen';
import EmployeesScreen from '../screens/EmployeesScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import MaterialsScreen from '../screens/MaterialsScreen';
import FinanceScreen from '../screens/FinanceScreen';
import AlertsScreen from '../screens/AlertsScreen';
import AIAssistantScreen from '../screens/AIAssistantScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import QuickActionsScreen from '../screens/QuickActionsScreen';
import QRScannerScreen from '../screens/QRScannerScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const RootStack = createStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.panel,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
    notification: colors.danger,
  },
};

function WorkOrdersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WorkOrdersList" component={WorkOrdersScreen} />
      <Stack.Screen name="WorkOrderDetail" component={WorkOrderDetailScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const notificationsCount = useAppStore((s) => s.notificationsCount);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.panel,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          paddingTop: 4,
          height: 60,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: {
          fontSize: fontSize.xs,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'דשבורד',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="WorkOrders"
        component={WorkOrdersStack}
        options={{
          title: 'עבודה',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'construct' : 'construct-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="QuickActions"
        component={QuickActionsScreen}
        options={{
          title: 'פעולות',
          tabBarIcon: ({ focused, color }) => (
            <View style={styles.centerTabIcon}>
              <Ionicons name={focused ? 'flash' : 'flash-outline'} size={28} color={color} />
            </View>
          ),
          tabBarLabelStyle: {
            fontSize: fontSize.xs,
            fontWeight: '700',
          },
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'התראות',
          tabBarBadge: notificationsCount > 0 ? notificationsCount : undefined,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AI"
        component={AIAssistantScreen}
        options={{
          title: 'AI',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <RootStack.Screen name="Main" component={MainTabs} />
            <RootStack.Screen name="Profile" component={ProfileScreen} />
            <RootStack.Screen name="Projects" component={ProjectsScreen} />
            <RootStack.Screen name="Materials" component={MaterialsScreen} />
            <RootStack.Screen name="Alerts" component={AlertsScreen} />
            <RootStack.Screen name="Employees" component={EmployeesScreen} />
            <RootStack.Screen
              name="QRScanner"
              component={QRScannerScreen}
              options={{ presentation: 'modal' }}
            />
          </>
        ) : (
          <RootStack.Screen name="Auth" component={AuthStack} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  centerTabIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent + '22',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: -4,
  },
});
