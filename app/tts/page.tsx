"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Web Speech API — sin servidor, sin límite, gratis
// Chrome: escuchar + descargar MP3 | Safari iOS: solo escuchar

export default function TTS() {
  const [texto,       setTexto]       = useState("");
  const [leyendo,     setLeyendo]     = useState(false);
  const [pausado,     setPausado]     = useState(false);
  const [progreso,    setProgreso]    = useState(0);   // 0..1
  const [voces,       setVoces]       = useState<SpeechSynthesisVoice[]>([]);
  const [vozIdx,      setVozIdx]      = useState(0);
  const [velocidad,   setVelocidad]   = useState(1);
  const [grabando,    setGrabando]    = useState(false);
  const [mp3Url,      setMp3Url]      = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [puedeGrabar, setPuedeGrabar] = useState(false);
  const [cargandoDoc, setCargandoDoc] = useState(false);

  const utterRef   = useRef<SpeechSynthesisUtterance | null>(null);
  const mediaRef   = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<BlobEvent["data"][]>([]);
  const inputRef   = useRef<HTMLInputElement>(null);

  // Cargar voces en español
  useEffect(() => {
    const cargar = () => {
      const all = speechSynthesis.getVoices();
      const esp = all.filter(v => v.lang.startsWith("es"));
      setVoces(esp.length ? esp : all.slice(0, 6));
    };
    cargar();
    speechSynthesis.addEventListener("voiceschanged", cargar);
    // Detectar soporte de grabación
    setPuedeGrabar(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia);
    return () => speechSynthesis.removeEventListener("voiceschanged", cargar);
  }, []);

  // ── Leer ──
  function hablar() {
    if (!texto.trim()) return;
    speechSynthesis.cancel();
    setError(null); setMp3Url(null); setProgreso(0);

    const utter = new SpeechSynthesisUtterance(texto);
    utter.voice  = voces[vozIdx] ?? null;
    utter.rate   = velocidad;
    utter.lang   = voces[vozIdx]?.lang ?? "es-AR";

    utter.onstart     = () => { setLeyendo(true); setPausado(false); };
    utter.onend       = () => { setLeyendo(false); setPausado(false); setProgreso(1); };
    utter.onerror     = () => { setLeyendo(false); setPausado(false); };
    utter.onboundary  = (e) => {
      if (e.name === "word") setProgreso(e.charIndex / texto.length);
    };

    utterRef.current = utter;
    speechSynthesis.speak(utter);
  }

  function pausar() {
    speechSynthesis.pause(); setPausado(true);
  }
  function reanudar() {
    speechSynthesis.resume(); setPausado(false);
  }
  function detener() {
    speechSynthesis.cancel();
    setLeyendo(false); setPausado(false); setProgreso(0);
    mediaRef.current?.stop();
  }

  // ── Grabar + hablar (Chrome) ──
  async function grabarYHablar() {
    if (!texto.trim()) return;
    setError(null); setMp3Url(null); setGrabando(true);
    try {
      // Captura audio del sistema (requiere compartir pestaña con audio en Chrome)
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) throw new Error("No se pudo capturar el audio. Asegurate de tildar 'Compartir audio de la pestaña'.");

      // Detener video inmediatamente (solo necesitamos audio)
      stream.getVideoTracks().forEach(t => t.stop());

      const audioStream = new MediaStream([audioTrack]);
      const rec = new MediaRecorder(audioStream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      rec.ondataavailable = e => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setMp3Url(URL.createObjectURL(blob));
        setGrabando(false);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRef.current = rec;
      rec.start();

      // Arrancar TTS
      hablar();

      // Parar grabación cuando termine el TTS
      const orig = utterRef.current!.onend as any;
      utterRef.current!.onend = (e: SpeechSynthesisEvent) => {
        orig?.(e);
        setTimeout(() => rec.stop(), 300);
      };
    } catch (e: unknown) {
      setGrabando(false);
      setError(e instanceof Error ? e.message : "Error al iniciar grabación.");
    }
  }

  // ── Cargar archivo ──
  async function cargarArchivo(file: File) {
    setCargandoDoc(true); setError(null);
    try {
      let txt = "";
      if (file.name.endsWith(".pdf")) {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        const ab  = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        const partes: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc   = await page.getTextContent();
          partes.push(tc.items.map((it: any) => it.str).join(" "));
        }
        txt = partes.join("\n");
      } else if (file.name.match(/\.docx?$/)) {
        const mammoth = await import("mammoth");
        const ab = await file.arrayBuffer();
        const r  = await mammoth.extractRawText({ arrayBuffer: ab });
        txt = r.value;
      } else {
        throw new Error("Formato no soportado. Usá PDF o Word (.docx).");
      }
      setTexto(txt.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al leer el archivo.");
    } finally { setCargandoDoc(false); }
  }

  const chars = texto.length;

  return (
    <section className="flex-1 w-full max-w-3xl mx-auto px-6 sm:px-8 py-16 flex flex-col">
      <motion.h2 initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
        className="font-black text-navy mb-2" style={{ fontSize:"clamp(2rem,6vw,3.5rem)", letterSpacing:"-0.04em" }}>
        Lectura
      </motion.h2>
      <p className="text-navy/45 mb-8">Pegá texto o subí un PDF / Word. Sin límite de longitud.</p>

      {/* Textarea */}
      <div className="relative" onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) cargarArchivo(f); }}
        onDragOver={e => e.preventDefault()}>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} disabled={leyendo}
          placeholder="Pegá el texto o arrastrá un archivo acá…" rows={10}
          className="w-full resize-none bg-navy/[0.03] rounded-2xl px-6 py-5 text-navy text-base leading-relaxed border border-navy/[0.08] focus:outline-none focus:border-ocre/50 transition-all placeholder:text-navy/25 disabled:opacity-60" />
        <span className="absolute bottom-4 right-5 text-navy/25 text-xs tabular-nums">{chars.toLocaleString()} chars</span>
      </div>

      {/* Barra de progreso */}
      {(leyendo || progreso > 0) && (
        <div className="mt-3 h-1 rounded-full bg-navy/8 overflow-hidden">
          <motion.div className="h-full bg-ocre rounded-full"
            animate={{ width: `${progreso * 100}%` }} transition={{ ease:"linear", duration:0.3 }} />
        </div>
      )}

      {/* Controles superiores */}
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) cargarArchivo(f); }} />
        <button onClick={() => inputRef.current?.click()} disabled={cargandoDoc || leyendo}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-navy/15 text-navy/60 text-sm hover:border-navy/30 hover:text-navy transition-colors disabled:opacity-40">
          {cargandoDoc ? <><span className="animate-spin text-ocre">◌</span> Leyendo…</> : <><span>📄</span> Subir PDF o Word</>}
        </button>
        {texto && !leyendo && (
          <button onClick={() => { setTexto(""); setProgreso(0); setMp3Url(null); }}
            className="text-navy/30 text-xs hover:text-navy/60 transition-colors">Limpiar</button>
        )}
      </div>

      {/* Selector de voz + velocidad */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-navy/40 uppercase tracking-wider mb-2">Voz</label>
          <select value={vozIdx} onChange={e => setVozIdx(+e.target.value)} disabled={leyendo}
            className="w-full bg-navy/3 rounded-xl px-4 py-2.5 text-navy text-sm font-medium border border-navy/8 focus:outline-none focus:ring-2 focus:ring-ocre/40 disabled:opacity-40">
            {voces.map((v, i) => <option key={i} value={i}>{v.name} ({v.lang})</option>)}
            {!voces.length && <option>Cargando voces…</option>}
          </select>
        </div>
        <div>
          <label className="block text-xs text-navy/40 uppercase tracking-wider mb-2">
            Velocidad <span className="text-ocre font-semibold">{velocidad}×</span>
          </label>
          <input type="range" min={0.5} max={2} step={0.1} value={velocidad}
            onChange={e => setVelocidad(+e.target.value)} disabled={leyendo} className="w-full mt-1" />
        </div>
      </div>

      {/* Botones principales */}
      <div className="mt-8 flex flex-wrap gap-3">
        {!leyendo ? (
          <>
            <button onClick={hablar} disabled={!texto.trim()}
              className="px-8 py-3.5 rounded-full bg-navy text-canvas font-semibold hover:bg-navy-soft transition-all disabled:opacity-40 flex items-center gap-2">
              <span>▶</span> Escuchar
            </button>
            {puedeGrabar && (
              <button onClick={grabarYHablar} disabled={!texto.trim() || grabando}
                className="px-8 py-3.5 rounded-full border-2 border-navy text-navy font-semibold hover:bg-navy hover:text-canvas transition-all disabled:opacity-40 flex items-center gap-2">
                {grabando ? <><span className="animate-spin text-ocre">◌</span> Preparando…</> : <><span>⏺</span> Escuchar y grabar MP3</>}
              </button>
            )}
          </>
        ) : (
          <>
            {!pausado ? (
              <button onClick={pausar}
                className="px-8 py-3.5 rounded-full bg-ocre text-navy font-semibold hover:bg-ocre-light transition-all flex items-center gap-2">
                <span>⏸</span> Pausar
              </button>
            ) : (
              <button onClick={reanudar}
                className="px-8 py-3.5 rounded-full bg-navy text-canvas font-semibold hover:bg-navy-soft transition-all flex items-center gap-2">
                <span>▶</span> Reanudar
              </button>
            )}
            <button onClick={detener}
              className="px-8 py-3.5 rounded-full border-2 border-navy/20 text-navy/60 font-semibold hover:border-navy/40 transition-all flex items-center gap-2">
              <span>⏹</span> Detener
            </button>
          </>
        )}

        {mp3Url && (
          <a href={mp3Url} download="lectura.webm"
            className="px-8 py-3.5 rounded-full border-2 border-ocre text-ocre-dark font-semibold hover:bg-ocre hover:text-navy transition-all flex items-center gap-2">
            <span>⬇</span> Descargar grabación
          </a>
        )}
      </div>

      {/* Info grabación */}
      <div className="mt-3 flex flex-col gap-1">
        {puedeGrabar && !leyendo && !mp3Url && (
          <p className="text-navy/30 text-xs">
            Para grabar: Chrome te pedirá compartir la pestaña. Tildá "Compartir audio de la pestaña" para que capture el audio.
          </p>
        )}
        <p className="text-navy/30 text-xs">
          En Safari es posible que no se permita descargar el audio grabado.
        </p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            className="mt-5 px-5 py-4 rounded-xl border text-sm"
            style={{ background:"rgba(201,162,39,0.08)", borderColor:"rgba(201,162,39,0.3)", color:"rgba(11,31,77,0.7)" }}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
