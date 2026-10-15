"use client";
import { useEffect, useRef, useState } from "react";
export function CoverPicker({
  onFile,
  disabled = false,
  label = "Scegli foto",
}: {
  onFile: (file: File) => Promise<void>;
  disabled?: boolean;
  label?: string;
}) {
  const [file, setFile] = useState<File | null>(null),
    [image, setImage] = useState<HTMLImageElement | null>(null),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setZoom(1);
      setX(50);
      setY(50);
    };
    img.onerror = () => setError("Foto non leggibile. Usa JPEG, PNG o WebP.");
    img.src = url;
    dialog.current?.showModal();
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!image || !preview.current) return;
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    preview.current
      .getContext("2d")
      ?.drawImage(
        image,
        ((image.naturalWidth - side) * x) / 100,
        ((image.naturalHeight - side) * y) / 100,
        side,
        side,
        0,
        0,
        256,
        256,
      );
  }, [image, zoom, x, y]);
  async function accept(crop: boolean) {
    if (!image) return;
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      if (crop) {
        const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
        canvas.width = canvas.height = Math.min(1400, Math.round(side));
        canvas
          .getContext("2d")!
          .drawImage(
            image,
            ((image.naturalWidth - side) * x) / 100,
            ((image.naturalHeight - side) * y) / 100,
            side,
            side,
            0,
            0,
            canvas.width,
            canvas.height,
          );
      } else {
        const factor = Math.min(
          1,
          2048 / Math.max(image.naturalWidth, image.naturalHeight),
        );
        canvas.width = Math.round(image.naturalWidth * factor);
        canvas.height = Math.round(image.naturalHeight * factor);
        canvas
          .getContext("2d")!
          .drawImage(image, 0, 0, canvas.width, canvas.height);
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("Foto non elaborata.")),
          "image/webp",
          0.87,
        ),
      );
      if (blob.size > 4 * 1024 * 1024)
        throw new Error(
          "Foto troppo grande. Ritagliala o scegli una foto più piccola.",
        );
      await onFile(new File([blob], "copertina.webp", { type: "image/webp" }));
      dialog.current?.close();
      setFile(null);
      setImage(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Foto non caricata.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="button-row cover-picker">
        <label className="file-button">
          <span>{label}</span>
          <input
            aria-label={label}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={(e) => {
              setError("");
              setFile(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
        </label>
        <label className="file-button">
          <span>Fotocamera</span>
          <input
            aria-label="Scatta una foto"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <dialog
        ref={dialog}
        className="crop-dialog"
        aria-label="Ritaglia copertina"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else {
            setFile(null);
            setImage(null);
          }
        }}
      >
        <h3>La copertina, come la vuoi</h3>
        <canvas ref={preview} width="256" height="256" />
        <label className="field">
          Zoom
          <input
            aria-label="Zoom ritaglio"
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <label className="field">
          Posizione orizzontale
          <input
            aria-label="Posizione orizzontale ritaglio"
            type="range"
            min="0"
            max="100"
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
          />
        </label>
        <label className="field">
          Posizione verticale
          <input
            aria-label="Posizione verticale ritaglio"
            type="range"
            min="0"
            max="100"
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
          />
        </label>
        <div className="button-row">
          <button
            className="button primary"
            disabled={busy || !image}
            onClick={() => void accept(true)}
          >
            Usa ritaglio
          </button>
          <button
            className="button soft"
            disabled={busy || !image}
            onClick={() => void accept(false)}
          >
            Usa foto intera
          </button>
          <button
            className="button soft"
            disabled={busy}
            onClick={() => {
              dialog.current?.close();
              setFile(null);
              setImage(null);
            }}
          >
            Annulla
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </dialog>
    </>
  );
}
