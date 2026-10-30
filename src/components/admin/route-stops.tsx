"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useFieldError } from "@/components/admin/form-error-context";
import { defaultMapPoint, searchPlaces, type MapPoint } from "@/components/admin/location-picker";
import { controlClass } from "@/components/admin/ui";

const RouteMap = dynamic(() => import("@/components/admin/fleet-playback-map"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-slate-100" />,
});

export type RouteStop = MapPoint & { label: string };

type SavedPlace = { id: string; name: string; address: string; latitude?: number | null; longitude?: number | null };

function sameStop(left: MapPoint, right: MapPoint) {
  return Math.abs(left.latitude - right.latitude) < 0.0002 && Math.abs(left.longitude - right.longitude) < 0.0002;
}

export function RouteStops({
  stops,
  places,
  onChange,
}: {
  stops: RouteStop[];
  places: SavedPlace[];
  onChange: (stops: RouteStop[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<RouteStop & { name: string }>>([]);
  const [status, setStatus] = useState("");
  const [placeId, setPlaceId] = useState("");
  const bias = useRef(defaultMapPoint);
  bias.current = stops.at(-1) || defaultMapPoint;
  const routeError = useFieldError("route");
  const text = query.trim();
  const saved = places.filter((place) => place.latitude != null && place.longitude != null);

  useEffect(() => {
    if (text.length < 3) {
      setHits([]);
      setStatus("");
      return;
    }
    let ignore = false;
    const timer = window.setTimeout(() => {
      setStatus("Searching…");
      searchPlaces(text, bias.current).then((next) => {
        if (ignore) return;
        setHits(next.map((place) => ({ latitude: place.latitude, longitude: place.longitude, label: place.label, name: place.name })));
        setStatus(next.length ? "" : "No places match that search.");
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
  }, [text]);

  function addStop(stop: RouteStop) {
    if (stops.length >= 50) {
      setStatus("A route can have up to 50 stops.");
      return;
    }
    const previous = stops.at(-1);
    if (previous && sameStop(previous, stop)) {
      setStatus("That place is already the last stop.");
      return;
    }
    onChange([...stops, stop]);
    setQuery("");
    setHits([]);
    setStatus("");
    setPlaceId("");
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= stops.length) return;
    const copy = [...stops];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    onChange(copy);
  }

  return (
    <div className="space-y-2 md:col-span-3">
      <p className="text-sm font-medium text-slate-700">Planned route</p>
      <p className="text-sm text-slate-600">
        Search each stop in travel order. Choosing a result stores its map point, so you do not need latitude and longitude.
      </p>
      {routeError ? <p className="text-sm leading-5 text-red-700">{routeError}</p> : null}
      <input
        aria-label="Search a route stop"
        className={controlClass}
        placeholder="Search a stop, such as Bhiwandi or Nagpur"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const first = hits[0];
          if (first) addStop(first);
        }}
      />
      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
      {text.length >= 3 && hits.length ? (
        <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {hits.map((place) => (
            <li key={`${place.latitude}-${place.longitude}-${place.label}`}>
              <button className="w-full px-3 py-2 text-left hover:bg-slate-50" type="button" onClick={() => addStop(place)}>
                <span className="block text-sm font-medium text-slate-900">{place.name || place.label}</span>
                {place.name ? <span className="mt-0.5 block text-xs leading-4 text-slate-500">{place.label.slice(place.name.length).replace(/^,\s*/, "")}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {saved.length ? (
        <select
          aria-label="Add a saved place"
          className={controlClass}
          value={placeId}
          onChange={(event) => {
            const place = saved.find((item) => item.id === event.target.value);
            setPlaceId(event.target.value);
            if (!place || place.latitude == null || place.longitude == null) return;
            addStop({
              latitude: place.latitude,
              longitude: place.longitude,
              label: place.address ? `${place.name}, ${place.address}` : place.name,
            });
          }}
        >
          <option value="">Add a saved place</option>
          {saved.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
        </select>
      ) : null}
      {stops.length ? (
        <div className="h-64 overflow-hidden rounded-xl border border-slate-200">
          <RouteMap points={stops} />
        </div>
      ) : null}
      {stops.length ? (
        <ol className="space-y-2">
          {stops.map((stop, index) => (
            <li key={`${stop.label}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{index + 1}. {stop.label}</p>
                <p className="text-xs text-slate-500">{stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}</p>
              </div>
              <span className="flex shrink-0 gap-3">
                <button className="text-sm text-slate-600 hover:underline disabled:text-slate-300" disabled={index === 0} type="button" onClick={() => move(index, -1)}>Up</button>
                <button className="text-sm text-slate-600 hover:underline disabled:text-slate-300" disabled={index === stops.length - 1} type="button" onClick={() => move(index, 1)}>Down</button>
                <button className="text-sm font-medium text-red-700 hover:underline" type="button" onClick={() => onChange(stops.filter((_, item) => item !== index))}>Remove</button>
              </span>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-slate-500">No stops yet. The route is optional.</p>}
    </div>
  );
}
