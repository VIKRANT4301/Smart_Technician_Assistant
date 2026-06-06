import React from 'react';
import { Pressable } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Home, History as HistoryIcon, Settings as SettingsIcon, BookOpen, Bell, MessageSquare, Sun, Moon } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';

// Import screens
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import CameraScreen from '../screens/CameraScreen';
import VoiceScreen from '../screens/VoiceScreen';
import ResultScreen from '../screens/ResultScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import KnowledgeScreen from '../screens/KnowledgeScreen';
import NotificationScreen from '../screens/NotificationScreen';
import ChatScreen from '../screens/ChatScreen';
import DigitalTwinScreen from '../screens/DigitalTwinScreen';


export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  MainTabs: undefined;
  Camera: undefined;
  VoiceQuery: { imageUri?: string } | undefined;
  Result: { analysisResult: any };
  Notifications: undefined;
  DigitalTwin: { assetId: string };
};

export type TabParamList = {
  HomeTab: undefined;
  KnowledgeTab: undefined;
  ChatTab: undefined;
  HistoryTab: undefined;
  SettingsTab: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TabNavigator = () => {
  const { theme, setTheme } = useApp();
  const activeTheme = Theme.colors[theme];

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: activeTheme.card,
          borderBottomWidth: 1,
          borderBottomColor: activeTheme.border,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: {
          color: activeTheme.text,
          fontWeight: 'bold',
          letterSpacing: 1.5,
          fontSize: 14,
        },
        headerRight: () => {
          const isLight = theme === 'light';
          return (
            <Pressable
              onPress={() => setTheme(isLight ? 'cyberpunk' : 'light')}
              style={({ pressed }) => ({
                marginRight: 16,
                padding: 6,
                borderRadius: 20,
                backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent',
              })}
            >
              {isLight ? (
                <Moon size={18} color={activeTheme.text} />
              ) : (
                <Sun size={18} color={activeTheme.primary} />
              )}
            </Pressable>
          );
        },
        tabBarStyle: {
          backgroundColor: activeTheme.card,
          borderTopWidth: 1,
          borderTopColor: activeTheme.border,
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarActiveTintColor: activeTheme.primary,
        tabBarInactiveTintColor: activeTheme.muted,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'A.I. COGNITIVE HUB',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="KnowledgeTab"
        component={KnowledgeScreen}
        options={{
          title: 'KNOWLEDGE REPOSITORY',
          tabBarLabel: 'Knowledge',
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="ChatTab"
        component={ChatScreen}
        options={{
          title: 'AI COGNITIVE ASSISTANT',
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryScreen}
        options={{
          title: 'MAINTENANCE CHRONOLOGY',
          tabBarLabel: 'Logs',
          tabBarIcon: ({ color, size }) => <HistoryIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: 'SYSTEM CONFIG',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};


const AppNavigator = () => {
  const { theme, setTheme } = useApp();
  const activeTheme = Theme.colors[theme];

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: activeTheme.background },
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="MainTabs" component={TabNavigator} />
        <Stack.Screen 
          name="Camera" 
          component={CameraScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="VoiceQuery" 
          component={VoiceScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="Result" 
          component={ResultScreen} 
          options={{ 
            headerShown: true,
            title: 'DIAGNOSTIC REPORT',
            headerStyle: {
              backgroundColor: activeTheme.card,
              borderBottomWidth: 1,
              borderBottomColor: activeTheme.border,
            },
            headerTintColor: activeTheme.text,
            headerTitleStyle: {
              fontWeight: '900',
              letterSpacing: 2,
              fontSize: 13,
            },
            headerRight: () => {
              const isLight = theme === 'light';
              return (
                <Pressable
                  onPress={() => setTheme(isLight ? 'cyberpunk' : 'light')}
                  style={({ pressed }) => ({
                    marginRight: 16,
                    padding: 6,
                    borderRadius: 20,
                    backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent',
                  })}
                >
                  {isLight ? (
                    <Moon size={18} color={activeTheme.text} />
                  ) : (
                    <Sun size={18} color={activeTheme.primary} />
                  )}
                </Pressable>
              );
            }
          }}
        />
        <Stack.Screen 
          name="Notifications" 
          component={NotificationScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DigitalTwin"
          component={DigitalTwinScreen}
          options={{
            headerShown: true,
            title: 'DIGITAL TWIN',
            headerStyle: {
              backgroundColor: activeTheme.card,
              borderBottomWidth: 1,
              borderBottomColor: activeTheme.border,
            },
            headerTintColor: activeTheme.primary,
            headerTitleStyle: {
              fontWeight: '900',
              letterSpacing: 2,
              fontSize: 13,
              color: activeTheme.primary,
            },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;

