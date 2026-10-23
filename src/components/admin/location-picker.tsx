"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { controlClass } from "@/components/admin/ui";

const LocationMap = dynamic(() => import("@/components/admin/location-map"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-slate-100" />,
});

export type MapPoint = { latitude: number; longitude: number };

export const defaultMapPoint: MapPoint = { latitude: 19.076, longitude: 72.877 };

type PlaceHit = MapPoint & { label: string; name: string };

type PhotonProps = {
  name?: string;
  housenumber?: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

function placeLabel(parts: Array<string | undefined>) {
  const unique: string[] = [];
  for (const part of parts) {
    const text = part?.trim();
    if (!text || unique.some((item) => item.toLowerCase() === text.toLowerCase())) continue;
    unique.push(text);
  }
  return unique.join(", ");
}

function labelFromPhoton(props: PhotonProps) {
  const street = [props.housenumber, props.street].filter(Boolean).join(" ");
  return {
    name: props.name?.trim() || "",
    label: placeLabel([props.name, street, props.locality, props.district, props.city, props.state, props.postcode, props.country]),
  };
}

async function findPlaces(text: string, bias: MapPoint) {
  const photonUrl = new URL("https://photon.komoot.io/api/");
  photonUrl.searchParams.set("q", text);
  photonUrl.searchParams.set("limit", "6");
  photonUrl.searchParams.set("lang", "en");
  photonUrl.searchParams.set("lat", String(bias.latitude));
  photonUrl.searchParams.set("lon", String(bias.longitude));
  const photonResponse = await fetch(photonUrl);
  if (photonResponse.ok) {
    const data = (await photonResponse.json()) as { features?: Array<{ properties?: PhotonProps; geometry?: { coordinates?: number[] } }> };
    const hits = (data.features || []).flatMap((feature) => {
      const [longitude, latitude] = feature.geometry?.coordinates || [];
      const named = labelFromPhoton(feature.properties || {});
      if (!named.label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [{ ...named, latitude, longitude }];
    });
    if (hits.length) {
      const query = text.toLowerCase();
      return hits.sort((left, right) => rankPlace(left, query) - rankPlace(right, query));
    }
  }

  const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
  nominatimUrl.searchParams.set("q", text);
  nominatimUrl.searchParams.set("format", "jsonv2");
  nominatimUrl.searchParams.set("addressdetails", "1");
  nominatimUrl.searchParams.set("namedetails", "1");
  nominatimUrl.searchParams.set("limit", "6");
  const response = await fetch(nominatimUrl);
  if (!response.ok) throw new Error("Search failed");
  const rows = (await response.json()) as Array<{
    name?: string;
    display_name?: string;
    lat?: string;
    lon?: string;
    namedetails?: { "name:en"?: string };
    address?: Record<string, string>;
  }>;
  return rows.flatMap((row) => {
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    const name = row.namedetails?.["name:en"] || row.name || row.address?.building || row.address?.amenity || row.address?.tourism || row.address?.historic || row.address?.shop || row.address?.office || "";
    const display = row.display_name?.trim() || "";
    const label = name && !display.toLowerCase().startsWith(name.toLowerCase()) ? `${name}, ${display}` : display;
    if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ name, label, latitude, longitude }];
  });
}

function rankPlace(place: PlaceHit, query: string) {
  const name = place.name.toLowerCase();
  if (!name) return 4;
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  return 3;
}

async function addressForPoint(point: MapPoint) {
  const photonUrl = new URL("https://photon.komoot.io/reverse");
  photonUrl.searchParams.set("lat", String(point.latitude));
  photonUrl.searchParams.set("lon", String(point.longitude));
  photonUrl.searchParams.set("lang", "en");
  const photonResponse = await fetch(photonUrl);
  if (photonResponse.ok) {
    const data = (await photonResponse.json()) as { features?: Array<{ properties?: PhotonProps }> };
    const label = labelFromPhoton(data.features?.[0]?.properties || {}).label;
    if (label) return label;
  }
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(point.latitude));
  url.searchParams.set("lon", String(point.longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Lookup failed");
  const row = (await response.json()) as { display_name?: string; name?: string; namedetails?: { "name:en"?: string } };
  const name = row.namedetails?.["name:en"] || row.name || "";
  const display = row.display_name?.trim() || "";
  if (name && display && !display.toLowerCase().startsWith(name.toLowerCase())) return `${name}, ${display}`;
  return display;
}

function samePlace(left: MapPoint, right: MapPoint) {
  return Math.abs(left.latitude - right.latitude) < 0.0002 && Math.abs(left.longitude - right.longitude) < 0.0002;
}

export function LocationPicker({
  point,
  confirmed,
  lookupQuery,
  onPointChange,
  onAddressChange,
  onConfirm,
}: {
  point: MapPoint;
  confirmed: boolean;
  lookupQuery: string;
  onPointChange: (point: MapPoint) => void;
  onAddressChange: (address: string) => void;
  onConfirm: () => void;
}) {
  const [mapQuery, setMapQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [status, setStatus] = useState("");
  const [focusToken, setFocusToken] = useState(0);
  const [chosen, setChosen] = useState<PlaceHit | null>(null);
  const [popupLabel, setPopupLabel] = useState("");
  const movePin = useRef(onPointChange);
  const bias = useRef(point);
  const skipQuery = useRef("");
  const appliedLabel = useRef("");
  movePin.current = onPointChange;
  bias.current = point;
  const mapText = mapQuery.trim() === skipQuery.current ? "" : mapQuery.trim();
  const activeQuery = mapText.length >= 3 ? mapText : lookupQuery.trim();
  const visibleHits = activeQuery.length < 3 ? [] : hits;

  function applyPlace(place: PlaceHit) {
    setChosen(place);
    setPopupLabel(place.label);
    movePin.current({ latitude: place.latitude, longitude: place.longitude });
    setFocusToken((token) => token + 1);
  }

  function movePinByHand(next: MapPoint) {
    setChosen(null);
    setPopupLabel("");
    onPointChange(next);
  }

  useEffect(() => {
    if (activeQuery.length < 3) {
      setHits([]);
      setStatus("");
      return;
    }
    let ignore = false;
    const timer = window.setTimeout(() => {
      setStatus("Searching…");
      findPlaces(activeQuery, bias.current).then((next) => {
        if (ignore) return;
        setHits(next);
        setStatus(next.length ? "" : "No places match that search.");
        const first = next[0];
        if (!first) return;
        applyPlace(first);
      }).catch(() => {
        if (ignore) return;
        setHits([]);
        setStatus("Place search is unavailable right now.");
      });
    }, 450);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [activeQuery]);

  function choosePlace(place: PlaceHit) {
    applyPlace(place);
    setStatus("");
  }

  async function confirm() {
    const label = chosen && samePlace(chosen, point) ? chosen.label : await addressForPoint(point).catch(() => "");
    appliedLabel.current = "";
    setHits([]);
    if (label) {
      skipQuery.current = label;
      appliedLabel.current = label;
      setMapQuery(label);
      setPopupLabel(label);
      onAddressChange(label);
    } else {
      skipQuery.current = mapQuery.trim();
    }
    onConfirm();
  }

  return (
    <div className="space-y-2 md:col-span-3">
      <p className="text-sm font-medium text-slate-700">Location</p>
      <p className="text-sm text-slate-600">
        Search a building or landmark, or type the address. The pin shows the match while you keep typing. Confirm the location to fill the address.
      </p>
      <input
        aria-label="Search the map"
        className={controlClass}
        placeholder="Search a building or landmark, such as Phoenix Marketcity"
        type="search"
        value={mapQuery}
        onChange={(event) => {
          skipQuery.current = "";
          appliedLabel.current = "";
          setMapQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      />
      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
      {visibleHits.length ? (
        <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {visibleHits.map((place) => (
            <li key={`${place.latitude}-${place.longitude}-${place.label}`}>
              <button
                className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                type="button"
                onClick={() => choosePlace(place)}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="h-72 overflow-hidden rounded-lg border border-slate-300">
        <LocationMap focusToken={focusToken} onPointChange={movePinByHand} point={point} popupLabel={popupLabel} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg border border-teal-800 px-4 py-2 text-sm font-medium text-teal-900 hover:bg-teal-50"
          onClick={() => { void confirm(); }}
          type="button"
        >
          Confirm location
        </button>
        <p className="text-sm text-slate-600">
          {confirmed
            ? `Confirmed at ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}.`
            : "Not confirmed yet. Saving stays off until you confirm the pin."}
        </p>
      </div>
    </div>
  );
}
