"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

// Leaflet only tracks window resizes, so a collapsing sidebar would leave grey, unloaded tiles.
export function MapResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
