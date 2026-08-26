import { useCallback, useEffect, useRef, useState } from "react";

export function useFullscreenTarget<T extends HTMLElement>() {
  const targetRef = useRef<T | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === targetRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const target = targetRef.current;
    if (!target) return;

    try {
      if (document.fullscreenElement === target) {
        await document.exitFullscreen();
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }

      await target.requestFullscreen();
    } catch {
      // Ignore fullscreen failures so play remains uninterrupted.
    }
  }, []);

  return {
    targetRef,
    isFullscreen,
    toggleFullscreen
  };
}
