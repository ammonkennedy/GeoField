import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={95}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Samples",
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="square.stack.3d.up.fill" tintColor={color} size={size} />
            ) : (
              <Feather name="layers" size={size} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="map.fill" tintColor={color} size={size} />
            ) : (
              <Feather name="map" size={size} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="compass"
        options={{
          title: "Compass",
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="location.north.circle.fill" tintColor={color} size={size} />
            ) : (
              <MaterialCommunityIcons name="compass" size={size} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="strat"
        options={{
          title: "Strat",
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="chart.bar.fill" tintColor={color} size={size} />
            ) : (
              <Feather name="bar-chart-2" size={size} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="ellipsis.circle.fill" tintColor={color} size={size} />
            ) : (
              <Feather name="more-horizontal" size={size} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}
