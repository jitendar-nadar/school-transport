"use client";

import { useEffect, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { MapBounds, MapPoint } from "@/components/admin/location-picker";

const pin = L.divIcon({
  className: "location-pin",
  html: '<svg class="location-pin-shape" viewBox="0 0 32 42" width="32" height="42" aria-hidden="true" style="display:block;width:32px;height:42px;background:transparent;border:0;border-radius:0;overflow:visible;filter:drop-shadow(0 3px 2px rgba(15,23,42,.35))"><path d="M16 41s14-14.2 14-25A14 14 0 1 0 2 16c0 10.8 14 25 14 25z" fill="#0f766e"/><circle cx="16" cy="15.5" r="5.5" fill="#fff"/></svg>',
  iconSize: [32, 42],
  iconAnchor: [16, 40],
  popupAnchor: [0, -40],
});

function FocusPoint({ point, bounds, focusToken }: { point: MapPoint; bounds?: MapBounds; focusToken: number }) {
  const map = useMap();
  const seen = useRef(focusToken);
  useEffect(() => {
    if (seen.current === focusToken) return;
    seen.current = focusToken;
    if (bounds) {
      map.flyToBounds(
        [[bounds.south, bounds.west], [bounds.north, bounds.east]],
        { duration: 0.8, maxZoom: 18, padding: [36, 36] },
      );
      return;
    }
    map.flyTo([point.latitude, point.longitude], 18, { duration: 0.8 });
  }, [bounds, focusToken, map, point.latitude, point.longitude]);
  return null;
}

function Measure() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.scale({ imperial: false, maxWidth: 120, position: "bottomleft" });
    control.addTo(map);
    return () => { control.remove(); };
  }, [map]);
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
          maxWidth={280}
          offset={[0, -44]}
          position={[point.latitude, point.longitude]}
        >
          <PopupCard label={label} />
        </Popup>
      ) : null}
    </>
  );
}

function PopupCard({ label }: { label: string }) {
  const splitAt = label.indexOf(", ");
  const title = splitAt === -1 ? label : label.slice(0, splitAt);
  const detail = splitAt === -1 ? "" : label.slice(splitAt + 2);
  return (
    <span className="location-popup">
      <span className="location-popup-title" style={{ display: "block", color: "#0f172a", fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{title}</span>
      {detail ? <span className="location-popup-detail" style={{ display: "block", marginTop: 2, color: "#475569", fontSize: 12, lineHeight: 1.35 }}>{detail}</span> : null}
    </span>
  );
}

export default function LocationMap({
  point,
  bounds,
  focusToken,
  popupLabel,
  onPointChange,
}: {
  point: MapPoint;
  bounds?: MapBounds;
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
    <MapContainer center={[point.latitude, point.longitude]} className="h-full w-full" maxZoom={19} zoom={13}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FocusPoint bounds={bounds} focusToken={focusToken} point={point} />
      <Measure />
      <MapClicks onPointChange={onPointChange} />
      <PinMarker label={popupLabel} onPointChange={onPointChange} point={point} />
    </MapContainer>
  );
}
