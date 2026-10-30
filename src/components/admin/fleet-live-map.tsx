"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

export type LiveTruck = {
  id: string;
  registrationNumber: string;
  status: "MOVING" | "IDLE" | "STOPPED" | "OFFLINE" | string;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  ignition: boolean | null;
  recordedAt: string | null;
};

const colors: Record<string, string> = {
  MOVING: "#0f766e",
  IDLE: "#b45309",
  STOPPED: "#475569",
  OFFLINE: "#b91c1c",
};

function dot(status: string) {
  const color = colors[status] || colors.OFFLINE;
  return L.divIcon({
    className: "fleet-dot",
    html: `<span style="display:block;width:16px;height:16px;border-radius:999px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(15,23,42,.45)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function FitTrucks({ trucks }: { trucks: LiveTruck[] }) {
  const map = useMap();
  const located = trucks.filter((truck) => truck.latitude != null && truck.longitude != null);
  const key = located.map((truck) => truck.id).join(",");
  useEffect(() => {
    if (!located.length) return;
    if (located.length === 1) {
      map.setView([located[0].latitude as number, located[0].longitude as number], 13);
      return;
    }
    map.fitBounds(located.map((truck) => [truck.latitude as number, truck.longitude as number]), { padding: [32, 32], maxZoom: 14 });
    // Fit when the set of trucks changes, not on every position refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function FleetLiveMap({ trucks }: { trucks: LiveTruck[] }) {
  useEffect(() => {
    const id = "leaflet-stylesheet";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "/leaflet.css";
    document.head.appendChild(link);
  }, []);

  const first = trucks.find((truck) => truck.latitude != null && truck.longitude != null);

  return (
    <MapContainer center={[first?.latitude ?? 19.076, first?.longitude ?? 72.877]} className="h-full w-full" zoom={11}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitTrucks trucks={trucks} />
      {trucks.map((truck) => truck.latitude == null || truck.longitude == null ? null : (
        <Marker key={truck.id} icon={dot(truck.status)} position={[truck.latitude, truck.longitude]}>
          <Popup>
            <span className="location-popup">
              <span className="location-popup-title" style={{ display: "block", fontWeight: 600 }}>{truck.registrationNumber}</span>
              <span className="location-popup-detail" style={{ display: "block", marginTop: 2 }}>
                {truck.status} · {truck.speedKmh == null ? "No speed" : `${Math.round(truck.speedKmh)} km/h`} · {truck.ignition == null ? "Ignition unknown" : truck.ignition ? "Ignition on" : "Ignition off"}
              </span>
            </span>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
