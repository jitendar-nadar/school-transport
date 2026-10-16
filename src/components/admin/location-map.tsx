"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { MapPoint } from "@/components/admin/location-picker";

const pin = L.divIcon({
  className: "location-pin",
  html: '<span class="location-pin-shape"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function MapClicks({ onPointChange }: { onPointChange: (point: MapPoint) => void }) {
  useMapEvents({
    click(event) {
      onPointChange({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

export default function LocationMap({
  point,
  onPointChange,
}: {
  point: MapPoint;
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
      <MapClicks onPointChange={onPointChange} />
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
    </MapContainer>
  );
}
