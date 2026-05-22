import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

export interface MarkerData {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  icon: string;
}

interface Props {
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  markers: MarkerData[];
  onMarkerPress: (id: string) => void;
  onPress: () => void;
}

export default function NativeMapView({ initialRegion, markers, onMarkerPress, onPress }: Props) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      onPress={onPress}
    >
      {markers.map((m) => (
        <Marker
          key={m.id}
          coordinate={{ latitude: m.latitude, longitude: m.longitude }}
          onPress={() => onMarkerPress(m.id)}
        >
          <MarkerPin color={m.color} />
        </Marker>
      ))}
    </MapView>
  );
}

function MarkerPin({ color }: { color: string }) {
  return (
    <React.Fragment>
      <MarkerPinView color={color} />
    </React.Fragment>
  );
}

import { View } from "react-native";
function MarkerPinView({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: "#fff",
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}
    />
  );
}
