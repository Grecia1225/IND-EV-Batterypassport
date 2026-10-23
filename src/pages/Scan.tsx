import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { decodeQrFromFile, decodeQrFromImageData, extractBatteryId } from "../lib/qr";

export function Scan() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const [camera, setCamera] = useState(false);
  const [msg, setMsg] = useState<{ type: "info" | "error"; text: string }>({ type: "info", text: "Scan with the camera, upload a photo of the QR, or type the battery ID." });
  const [manual, setManual] = useState("");

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null; setCamera(false);
  }
  useEffect(() => stopCamera, []);

  function handleText(text: string | null) {
    if (!text) { setMsg({ type: "error", text: "No QR code found in that image. Try a sharper, closer photo." }); return false; }
    const id = extractBatteryId(text);
    if (!id) { setMsg({ type: "error", text: "That QR code isn't a battery passport (it contains something else)." }); return false; }
    stopCamera(); setMsg({ type: "info", text: `Found ${id} — opening…` }); navigate(`/p/${id}`); return true;
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { setMsg({ type: "error", text: "This browser can't use the camera here (it needs HTTPS or localhost). Use the photo or typing option instead." }); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream; setCamera(true);
      setMsg({ type: "info", text: "Point the camera at the battery's QR code." });
      await new Promise((r) => setTimeout(r, 50));
      const video = videoRef.current!; video.srcObject = stream; await video.play();
      const tick = () => {
        const canvas = canvasRef.current;
        if (video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const text = decodeQrFromImageData(img.data, img.width, img.height);
            if (text && handleText(text)) return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setCamera(false); setMsg({ type: "error", text: "Camera blocked or unavailable. Allow camera access, or use the photo / typing option." });
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try { handleText(await decodeQrFromFile(file)); } catch { setMsg({ type: "error", text: "Couldn't read that image." }); }
  }

  const btn = "rounded-lg border border-[var(--color-graphite-700)] text-[var(--color-ink-100)] text-sm px-4 py-2 hover:border-[var(--color-accent-500)]/60";
  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] flex flex-col items-center px-6 py-10">
      <div className="max-w-sm w-full space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-ink-100)] mb-1">Scan a battery</h1>
          <p className={`text-xs ${msg.type === "error" ? "text-[var(--color-status-bad)]" : "text-[var(--color-ink-500)]"}`}>{msg.text}</p>
        </div>
        {camera && (
          <div className="relative rounded-xl overflow-hidden border border-[var(--color-graphite-700)] bg-black aspect-square">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-8 border-2 border-[var(--color-accent-400)]/60 rounded-lg pointer-events-none" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex flex-wrap gap-2">
          {camera ? <button onClick={stopCamera} className={btn}>Stop camera</button> : <button onClick={startCamera} className={btn}>Use camera</button>}
          <label className={`${btn} cursor-pointer`}>Upload a photo of the QR
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handleText(manual) || setMsg({ type: "error", text: "That doesn't look like a battery ID (example: DBP-7F3A9C)." }); }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or type the battery ID, e.g. DBP-7F3A9C"
            className="flex-1 rounded-lg bg-[var(--color-graphite-800)] border border-[var(--color-graphite-700)] px-3 py-2 text-sm text-[var(--color-ink-100)] font-mono" />
          <button type="submit" className={btn}>Open</button>
        </form>
        <p className="text-xs text-[var(--color-ink-700)]">Any phone's own camera app also works: it opens the passport link directly. This scanner only recognises this app's QR labels.</p>
      </div>
    </div>
  );
}
