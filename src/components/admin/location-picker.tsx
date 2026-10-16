"use client";

import dynamic from "next/dynamic";

const LocationMap = dynamic(() => import("@/components/admin/location-map"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-slate-100" />,
});

export type MapPoint = { latitude: number; longitude: number };

export const defaultMapPoint: MapPoint = { latitude: 19.076, longitude: 72.877 };

export function LocationPicker({
  point,
  confirmed,
  onPointChange,
  onConfirm,
}: {
  point: MapPoint;
  confirmed: boolean;
  onPointChange: (point: MapPoint) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2 md:col-span-3">
      <p className="text-sm font-medium text-slate-700">Location</p>
      <p className="text-sm text-slate-600">
        The pin starts near Mumbai. Drag it to the place, or click the map, then confirm before saving.
      </p>
      <div className="h-72 overflow-hidden rounded-lg border border-slate-300">
        <LocationMap onPointChange={onPointChange} point={point} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg border border-teal-800 px-4 py-2 text-sm font-medium text-teal-900 hover:bg-teal-50"
          onClick={onConfirm}
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
