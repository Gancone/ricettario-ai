"use client";
import { useEffect, useRef, useState } from "react";
import { readOffline, writeOffline } from "@/lib/offline-db";
import { displayImageUrl } from "@/lib/image-client";
import { variantImageUrl } from "@/lib/image-url";
export function RecipeImage({
  url,
  alt = "",
  className = "",
  kind = "thumb",
  onError,
}: {
  url: string;
  alt?: string;
  className?: string;
  kind?: "thumb" | "medium";
  onError?: () => void;
}) {
  const source = displayImageUrl(variantImageUrl(url, kind)),
    [src, setSrc] = useState(source),
    [failed, setFailed] = useState(false),
    object = useRef(""),
    attempted = useRef(false);
  useEffect(() => {
    setSrc(source);
    setFailed(false);
    attempted.current = false;
    return () => {
      if (object.current) URL.revokeObjectURL(object.current);
      object.current = "";
    };
  }, [source]);
  const fallback = async () => {
    if (attempted.current) return;
    attempted.current = true;
    try {
      const blob = await readOffline<Blob>("image:" + source);
      if (blob) {
        object.current = URL.createObjectURL(blob);
        setSrc(object.current);
        return;
      }
    } catch {}
    setFailed(true);
    onError?.();
  };
  if (failed)
    return (
      <span
        className={"image-unavailable " + className}
        aria-label="Photo non disponibile"
      >
        ✦
      </span>
    );
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onLoad={() => {
        if (src.startsWith("blob:") || kind !== "thumb") return;
        void fetch(source, { cache: "force-cache" })
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) =>
            blob && blob.size < 400000
              ? writeOffline("image:" + source, blob)
              : undefined,
          )
          .catch(() => {});
      }}
      onError={() => {
        if (src.startsWith("blob:")) {
          setFailed(true);
          onError?.();
        } else void fallback();
      }}
    />
  );
}
