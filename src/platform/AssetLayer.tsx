import { useEffect, useState, type ReactNode } from "react";
import type { AssetDescriptor } from "./types";
import { useAssetAvailability } from "./useAssetAvailability";

interface AssetLayerProps {
  asset: AssetDescriptor;
  className?: string;
  children?: ReactNode;
}

export function AssetLayer({ asset, className = "", children }: AssetLayerProps) {
  const available = useAssetAvailability(asset);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    setImgLoaded(available);
  }, [asset.path]);

  useEffect(() => {
    if (available) setImgLoaded(true);
  }, [available]);

  const canRenderImage = Boolean(asset.path) && !imgFailed;

  return (
    <div className={`asset-layer ${className}`.trim()}>
      <div className={asset.fallbackClassName} aria-hidden="true" />
      {canRenderImage ? (
        <img
          className={`asset-image ${imgLoaded ? "is-loaded" : ""}`.trim()}
          decoding="async"
          src={asset.path}
          alt={asset.alt}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgFailed(true)}
        />
      ) : null}
      {children}
    </div>
  );
}
