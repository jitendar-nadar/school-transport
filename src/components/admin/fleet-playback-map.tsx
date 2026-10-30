"use client";

import { useEffect } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";

type Point = { latitude: number; longitude: number };

function FitRoute({ points }: { points: Point[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 14);
      return;
    }
    if (points.length > 1) {
      map.fitBounds(points.map((point) => [point.latitude, point.longitude]), { padding: [28, 28] });
    }
  }, [map, points]);
  return null;
}

export default function FleetPlaybackMap({ points }: { points: Point[] }) {
  useEffect(() => {
    const id = "leaflet-stylesheet";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "/leaflet.css";
    document.head.appendChild(link);
  }, []);

  if (!points.length) return <div className="grid h-full place-items-center text-sm text-slate-500">No track for that day.</div>;

  return (
    <MapContainer center={[points[0].latitude, points[0].longitude]} className="h-full w-full" zoom={13}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitRoute points={points} />
      <Polyline color="#0f766e" positions={points.map((point) => [point.latitude, point.longitude])} weight={4} />
    </MapContainer>
  );
}
