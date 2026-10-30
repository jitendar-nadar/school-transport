"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useFieldError } from "@/components/admin/form-error-context";
import { controlClass } from "@/components/admin/ui";

const LocationMap = dynamic(() => import("@/components/admin/location-map"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-slate-100" />,
});

export type MapPoint = { latitude: number; longitude: number };

export const defaultMapPoint: MapPoint = { latitude: 19.076, longitude: 72.877 };

export type MapBounds = { south: number; west: number; north: number; east: number };

type PlaceHit = MapPoint & { label: string; name: string; kind: string; value?: string; bounds?: MapBounds };

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
  osm_key?: string;
  osm_value?: string;
  extent?: number[];
};

const preciseKinds = new Set(["building", "amenity", "shop", "tourism", "office", "historic", "leisure", "healthcare", "aeroway"]);

function placeBounds(west?: number, south?: number, east?: number, north?: number): MapBounds | undefined {
  if (![west, south, east, north].every((value) => typeof value === "number" && Number.isFinite(value))) return undefined;
  const width = Math.abs((east as number) - (west as number));
  const height = Math.abs((north as number) - (south as number));
  if (width === 0 || height === 0 || width > 0.05 || height > 0.05) return undefined;
  return { south: south as number, west: west as number, north: north as number, east: east as number };
}

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

export async function searchPlaces(text: string, bias: MapPoint = defaultMapPoint) {
  const photonUrl = new URL("https://photon.komoot.io/api/");
  photonUrl.searchParams.set("q", text);
  photonUrl.searchParams.set("limit", "6");
  photonUrl.searchParams.set("lang", "en");
  photonUrl.searchParams.set("lat", String(bias.latitude));
  photonUrl.searchParams.set("lon", String(bias.longitude));
  photonUrl.searchParams.set("location_bias_scale", "0.6");
  const photonResponse = await fetch(photonUrl);
  if (photonResponse.ok) {
    const data = (await photonResponse.json()) as { features?: Array<{ properties?: PhotonProps; geometry?: { coordinates?: number[] } }> };
    const hits = (data.features || []).flatMap((feature) => {
      const [longitude, latitude] = feature.geometry?.coordinates || [];
      const props = feature.properties || {};
      const named = labelFromPhoton(props);
      const [west, south, east, north] = props.extent || [];
      if (!named.label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [{ ...named, kind: props.osm_key || "", value: props.osm_value || "", bounds: placeBounds(west, south, east, north), latitude, longitude }];
    });
    if (hits.length) {
      const query = text.toLowerCase();
      return hits.sort((left, right) => comparePlaces(left, right, query, bias));
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
    type?: string;
    addresstype?: string;
    category?: string;
    boundingbox?: string[];
    namedetails?: { "name:en"?: string };
    address?: Record<string, string>;
  }>;
  return rows.flatMap((row) => {
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    const name = row.namedetails?.["name:en"] || row.name || row.address?.building || row.address?.amenity || row.address?.tourism || row.address?.historic || row.address?.shop || row.address?.office || "";
    const display = row.display_name?.trim() || "";
    const label = name && !display.toLowerCase().startsWith(name.toLowerCase()) ? `${name}, ${display}` : display;
    const [south, north, west, east] = (row.boundingbox || []).map(Number);
    if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ name, label, kind: row.category || "", value: row.addresstype || row.type || "", bounds: placeBounds(west, south, east, north), latitude, longitude }];
  });
}

function distance2(place: MapPoint, bias: MapPoint) {
  const latitude = place.latitude - bias.latitude;
  const longitude = (place.longitude - bias.longitude) * Math.cos((bias.latitude * Math.PI) / 180);
  return latitude * latitude + longitude * longitude;
}

function rankPlace(place: PlaceHit, query: string) {
  const name = place.name.toLowerCase();
  let rank = 4;
  if (name === query) rank = place.value === "city" || place.value === "state" || place.value === "country" ? -1 : place.value === "town" || place.value === "municipality" ? -0.4 : 0;
  else if (name && (name.startsWith(query) || query.startsWith(name))) rank = 1;
  else if (name && (name.includes(query) || query.includes(name))) rank = 2;
  else if (name) rank = 3;
  if (rank > 0 && preciseKinds.has(place.kind)) rank -= 0.2;
  return rank;
}

function comparePlaces(left: PlaceHit, right: PlaceHit, query: string, bias: MapPoint) {
  const rank = rankPlace(left, query) - rankPlace(right, query);
  if (rank !== 0) return rank;
  return distance2(left, bias) - distance2(right, bias);
}

async function addressForPoint(point: MapPoint) {
  const photonUrl = new URL("https://photon.komoot.io/reverse");
  photonUrl.searchParams.set("lat", String(point.latitude));
  photonUrl.searchParams.set("lon", String(point.longitude));
  photonUrl.searchParams.set("lang", "en");
  const photonResponse = await fetch(photonUrl);
  if (photonResponse.ok) {
    const data = (await photonResponse.json()) as { features?: Array<{ properties?: PhotonProps }> };
    const props = data.features?.[0]?.properties || {};
    const coarse = props.osm_key === "highway" || props.osm_key === "boundary" || props.osm_key === "place";
    const label = labelFromPhoton(props).label;
    if (label && !coarse) return label;
  }
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(point.latitude));
  url.searchParams.set("lon", String(point.longitude));
  url.searchParams.set("zoom", "18");
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
  const [focusBounds, setFocusBounds] = useState<MapBounds | undefined>(undefined);
  const [chosen, setChosen] = useState<PlaceHit | null>(null);
  const [popupLabel, setPopupLabel] = useState("");
  const movePin = useRef(onPointChange);
  const bias = useRef(point);
  const skipQuery = useRef("");
  const appliedLabel = useRef("");
  movePin.current = onPointChange;
  bias.current = point;
  const locationError = useFieldError("location");
  const mapText = mapQuery.trim() === skipQuery.current ? "" : mapQuery.trim();
  const activeQuery = mapText.length >= 3 ? mapText : lookupQuery.trim();
  const visibleHits = activeQuery.length < 3 ? [] : hits;

  function applyPlace(place: PlaceHit) {
    setChosen(place);
    setPopupLabel(place.label);
    setFocusBounds(place.bounds);
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
      searchPlaces(activeQuery, bias.current).then((next) => {
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
                className="w-full px-3 py-2 text-left hover:bg-slate-50"
                type="button"
                onClick={() => choosePlace(place)}
              >
                <span className="block text-sm font-medium text-slate-900">{place.name || place.label}</span>
                {place.name ? <span className="mt-0.5 block text-xs leading-4 text-slate-500">{place.label.slice(place.name.length).replace(/^,\s*/, "")}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="h-96 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <LocationMap bounds={focusBounds} focusToken={focusToken} onPointChange={movePinByHand} point={point} popupLabel={popupLabel} />
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
            ? `Confirmed at ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}.`
            : "Not confirmed yet. Confirm the pin before saving."}
        </p>
        {locationError ? <p className="w-full text-sm leading-5 text-red-700">{locationError}</p> : null}
      </div>
    </div>
  );
}
