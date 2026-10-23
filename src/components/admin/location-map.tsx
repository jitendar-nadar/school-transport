"use client";

import { useEffect, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { MapPoint } from "@/components/admin/location-picker";

const pin = L.divIcon({
  className: "location-pin",
  html: '<span class="location-pin-shape"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
});

function FocusPoint({ point, focusToken }: { point: MapPoint; focusToken: number }) {
  const map = useMap();
  const seen = useRef(focusToken);
  useEffect(() => {
    if (seen.current === focusToken) return;
    seen.current = focusToken;
    map.flyTo([point.latitude, point.longitude], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [focusToken, map, point.latitude, point.longitude]);
  return null;
}

function MapClicks({ onPointChange }: { onPointChange: (point: MapPoint) => void }) {
  useMapEvents({
    click(event) {
      onPointChange({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

function PinMarker({ point, label, onPointChange }: { point: MapPoint; label: string; onPointChange: (point: MapPoint) => void }) {
  return (
    <>
      <Marker
        alt="Location pin"
        draggable
        title="Drag the pin to the location"
        eventHandlers={{
          dragend(event) {
            const next = (event.target as L.Marker).getLatLng();
            onPointChange({ latitude: next.lat, longitude: next.lng });
          },
        }}
        icon={pin}
        position={[point.latitude, point.longitude]}
      />
      {label ? (
        <Popup
          autoPan={false}
          key={`${label}-${point.latitude}-${point.longitude}`}
          maxWidth={260}
          offset={[0, -18]}
          position={[point.latitude, point.longitude]}
        >
          <span className="location-popup">{label}</span>
        </Popup>
      ) : null}
    </>
  );
}

export default function LocationMap({
  point,
  focusToken,
  popupLabel,
  onPointChange,
}: {
  point: MapPoint;
  focusToken: number;
  popupLabel: string;
  onPointChange: (point: MapPoint) => void;
}) {
  useEffect(() => {
    const id = "leaflet-stylesheet";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "/leaflet.css";
    document.head.appendChild(link);
  }, []);

  return (
    <MapContainer center={[point.latitude, point.longitude]} className="h-full w-full" zoom={13}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FocusPoint focusToken={focusToken} point={point} />
      <MapClicks onPointChange={onPointChange} />
      <PinMarker label={popupLabel} onPointChange={onPointChange} point={point} />
    </MapContainer>
  );
}
