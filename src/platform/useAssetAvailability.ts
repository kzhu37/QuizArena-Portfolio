import { useEffect, useState } from "react";
import type { AssetDescriptor } from "./types";

const availabilityCache = new Map<string, true>();

export function useAssetAvailability(asset: AssetDescriptor) {
  const path = asset.path || "";
  const [available, setAvailable] = useState(() => (path ? availabilityCache.has(path) : false));

  useEffect(() => {
    if (!path) {
      setAvailable(false);
      return;
    }

    if (availabilityCache.has(path)) {
      setAvailable(true);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      availabilityCache.set(path, true);
      if (!cancelled) setAvailable(true);
    };
    image.onerror = () => {
      if (!cancelled) setAvailable(false);
    };
    image.src = path;
    return () => {
      cancelled = true;
    };
  }, [path]);

  return available;
}
