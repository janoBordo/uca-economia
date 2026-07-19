"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassButton, GlassSelect, GlassTextarea, GlassCard } from "../components/glass";
import { track } from "../lib/analytics";

// Lectura:
// - Escuchar con Web Speech (voz del navegador): gratis, sin límite, por partes,
//   con volver atrás / adelantar / pausar-resumir exacto, como un podcast.
// - Descargar .mp3 real: el cliente parte el texto y pide cada trozo a /api/tts
//   (proxy al TTS gratuito de Google) y concatena todo en un solo archivo.
//   No graba pantalla, no toca la base de datos, no agrega peso al cliente.

// Divide el texto en "partes" (oraciones agrupadas ≤160 chars) para navegar.
// El tope de 160 evita el bug de Chrome que corta las utterances de más de ~15s.
function dividirEnCapitulos(txt: string): string[] {
  const limpio = txt.replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  // Corta por oración; si una oración es larguísima, la parte igual en ~160.
  const oraciones = limpio.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) ?? [limpio];
  const caps: string[] = [];
  let buf = "";
  const push = (s: string) => { for (let k = 0; k < s.length; k += 160) caps.push(s.slice(k, k + 160).trim()); };
  for (const o of oraciones) {
    const frag = o.trim();
    if (!frag) continue;
    if (frag.length > 160) { if (buf) { caps.push(buf); buf = ""; } push(frag); continue; }
    if (buf && (buf + " " + frag).length > 160) { caps.push(buf); buf = frag; }
    else buf = buf ? buf + " " + frag : frag;
  }
  if (buf) caps.push(buf);
  return caps.filter(Boolean);
}

// Parte el texto en trozos ≤200 chars (límite del TTS de Google), cortando en palabras.
function trozos200(txt: string): string[] {
  const limpio = txt.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  let i = 0;
  while (i < limpio.length) {
    let end = Math.min(i + 200, limpio.length);
    if (end < limpio.length) {
      const slice = limpio.slice(i, end);
      const corte = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf(","), slice.lastIndexOf("."));
      if (corte > 80) end = i + corte + 1;
    }
    const t = limpio.slice(i, end).trim();
    if (t) out.push(t);
    i = end;
  }
  return out;
}

export default function TTS() {
  const [texto,       setTexto]       = useState("");
  const [cargandoDoc, setCargandoDoc] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const [voces,       setVoces]       = useState<SpeechSynthesisVoice[]>([]);
  const [vozIdx,      setVozIdx]      = useState(0);
  const [velocidad,   setVelocidad]   = useState(1);

  const [leyendo,     setLeyendo]     = useState(false);
  const [pausado,     setPausado]     = useState(false);
  const [capIdx,      setCapIdx]      = useState(0);   // parte actual
  const [progress,    setProgress]    = useState(0);   // 0..1, avanza suave mientras suena

  const [descargando, setDescargando] = useState(false);
  const [mp3Pct,      setMp3Pct]      = useState(0);

  const utterRef      = useRef<SpeechSynthesisUtterance | null>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const velRef        = useRef(1);   // velocidad viva para el encadenado onend
  const vozRef        = useRef(0);
  const genRef        = useRef(0);   // generación: invalida callbacks de utterances viejas
  const tickRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const partStartRef  = useRef(0);   // ms al arrancar el tramo actual
  const partDurRef    = useRef(1);   // duración estimada del tramo actual (ms)
  const offsetRef     = useRef(0);   // char donde arranca el tramo actual, dentro de la parte
  const boundaryRef   = useRef(0);   // último charIndex de onboundary (relativo al tramo) → resumir exacto

  const capitulos = useMemo(() => dividirEnCapitulos(texto), [texto]);

  useEffect(() => { velRef.current = velocidad; }, [velocidad]);
  useEffect(() => { vozRef.current = vozIdx; }, [vozIdx]);

  // Cargar voces en español
  useEffect(() => {
    const cargar = () => {
      const all = speechSynthesis.getVoices();
      const esp = all.filter(v => v.lang.startsWith("es"));
      setVoces(esp.length ? esp : all.slice(0, 6));
    };
    cargar();
    speechSynthesis.addEventListener("voiceschanged", cargar);
    return () => speechSynthesis.removeEventListener("voiceschanged", cargar);
  }, []);

  // Al cambiar el texto: frenar y volver al inicio
  useEffect(() => {
    detenerVoz();
    setLeyendo(false); setPausado(false); setCapIdx(0); setProgress(0);
    offsetRef.current = 0; boundaryRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  // Frenar al desmontar
  useEffect(() => () => detenerVoz(), []);

  // ── Reproducción por partes (Web Speech) ──
  // Web Speech no deja "pausar y seguir" de forma confiable ni cortar utterances
  // largas. Estrategia (100% cliente, sin red ni DB, cero peso extra):
  //  · Partes cortas (≤160 chars) leídas en cadena, evita el corte de Chrome a los ~15s.
  //  · Un "genRef" invalida callbacks de utterances viejas → sin carreras al saltar/pausar.
  //  · onboundary nos da el carácter exacto que se está leyendo DENTRO del tramo:
  //    al pausar guardamos ese offset; al reanudar leemos sólo el resto desde ahí,
  //    en vez de repetir la parte entera. Si el navegador no dispara boundary
  //    (pasa en Safari/iPhone), no perdemos nada: cae al comportamiento anterior
  //    (retoma desde donde arrancó ese tramo), nunca peor que antes.
  //  · La barra avanza suave por tiempo estimado (setInterval liviano), no a saltos.
  function limpiarTick() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }
  function detenerVoz() {
    genRef.current++;                       // invalida callbacks pendientes
    limpiarTick();
    if (utterRef.current) { utterRef.current.onend = null; utterRef.current.onerror = null; utterRef.current.onboundary = null; }
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  }

  // idx = parte a leer · offset = carácter donde arrancar DENTRO de esa parte (resume exacto)
  function reproducirDesde(idx: number, offset = 0) {
    if (!capitulos.length) return;
    detenerVoz();
    const gen = genRef.current;
    const total = capitulos.length;
    const i = Math.max(0, Math.min(idx, total - 1));
    const fullText = capitulos[i];
    const off = Math.max(0, Math.min(offset, Math.max(0, fullText.length - 1)));
    const restante = fullText.slice(off);

    setCapIdx(i);
    setPausado(false);
    setLeyendo(true);
    offsetRef.current = off;
    boundaryRef.current = 0;

    if (!restante.trim()) {                 // offset ya al final: seguir a la próxima parte
      if (i + 1 < total) { reproducirDesde(i + 1); return; }
      setLeyendo(false); setPausado(false); setCapIdx(total); setProgress(1); return;
    }

    const utter = new SpeechSynthesisUtterance(restante);
    const v = voces[vozRef.current];
    if (v) utter.voice = v;
    utter.rate = velRef.current;
    utter.lang = v?.lang ?? "es-AR";
    utter.onboundary = (e) => {
      if (genRef.current !== gen) return;
      boundaryRef.current = e.charIndex ?? 0;   // avance dentro del tramo → para resumir exacto
    };
    utter.onend = () => {
      if (genRef.current !== gen) return;   // callback viejo: ignorar
      if (i + 1 < total) reproducirDesde(i + 1);
      else { limpiarTick(); setLeyendo(false); setPausado(false); setCapIdx(total); setProgress(1); }
    };
    utter.onerror = () => {
      if (genRef.current !== gen) return;
      limpiarTick(); setLeyendo(false);
    };
    utterRef.current = utter;

    // Progreso suave: interpola por tiempo estimado dentro de lo que falta del tramo
    partStartRef.current = Date.now();
    partDurRef.current   = Math.max(500, (restante.length / (14 * velRef.current)) * 1000);
    limpiarTick();
    tickRef.current = setInterval(() => {
      if (genRef.current !== gen) return;
      const elapsedFrac = Math.min(1, (Date.now() - partStartRef.current) / partDurRef.current);
      const fracEnParte = (off + elapsedFrac * (fullText.length - off)) / fullText.length;
      setProgress((i + fracEnParte) / total);
    }, 100);

    window.speechSynthesis.speak(utter);
    window.speechSynthesis.resume();        // iOS a veces arranca pausado
  }

  // Botón central: reproducir / pausar
  function togglePlay() {
    if (!capitulos.length) return;
    if (leyendo) {                                    // sonando → pausar en el punto exacto
      const posicion = offsetRef.current + boundaryRef.current;
      detenerVoz();
      offsetRef.current = posicion;                   // recordado para resumir ahí
      setLeyendo(false); setPausado(true);
    } else if (pausado) {                              // pausado → resumir donde quedó
      reproducirDesde(capIdx, offsetRef.current);
    } else {                                           // detenido → arrancar la parte actual de cero
      track("tts_escuchar");
      reproducirDesde(capIdx >= capitulos.length ? 0 : capIdx);
    }
  }

  // Saltar a una parte y escucharla desde su inicio (botones ⏮/⏭ y toque en la barra)
  function irAParte(idx: number) {
    reproducirDesde(Math.max(0, Math.min(idx, capitulos.length - 1)));
  }

  function irInicio() {
    offsetRef.current = 0; boundaryRef.current = 0;
    if (leyendo) reproducirDesde(0);
    else { detenerVoz(); setCapIdx(0); setPausado(false); setProgress(0); }
  }

  // Barra clickeable: saltar tocando cualquier punto
  function seekBar(clientX: number, target: HTMLElement) {
    const total = capitulos.length;
    if (total <= 1) return irAParte(0);
    const rect  = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setProgress(ratio);                     // feedback inmediato
    irAParte(Math.round(ratio * (total - 1)));
  }

  // ── Descargar MP3 real (proxy TTS gratuito) ──
  async function descargarMp3() {
    if (!texto.trim() || descargando) return;
    setError(null); setDescargando(true); setMp3Pct(0);
    try {
      const trozos = trozos200(texto);
      const lang = (voces[vozIdx]?.lang ?? "es-AR").slice(0, 2);
      const partes: Blob[] = [];
      for (let i = 0; i < trozos.length; i++) {
        const r = await fetch(`/api/tts?tl=${lang}&q=${encodeURIComponent(trozos[i])}`);
        if (!r.ok) throw new Error("El servicio de audio no respondió. Probá de nuevo en un momento.");
        partes.push(await r.blob());
        setMp3Pct(Math.round(((i + 1) / trozos.length) * 100));
      }
      const mp3 = new Blob(partes, { type: "audio/mpeg" });
      const url = URL.createObjectURL(mp3);
      const a = document.createElement("a");
      a.href = url; a.download = "lectura.mp3";
      document.body.appendChild(a); a.click(); a.remove();
      track("mp3_descarga", { partes: trozos.length });
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error generando el MP3.");
    } finally {
      setDescargando(false);
    }
  }

  // ── Cargar archivo (PDF / Word / txt) ──
  async function cargarArchivo(file: File) {
    setCargandoDoc(true); setError(null);
    try {
      const nombre = file.name.toLowerCase();
      let txt = "";
      if (nombre.endsWith(".pdf")) {
        // pdf.js v4 usa Promise.withResolvers; polyfill para navegadores viejos (iOS/Safari)
        const P = Promise as unknown as { withResolvers?: () => unknown };
        if (typeof P.withResolvers !== "function") {
          P.withResolvers = function () {
            let resolve!: (v?: unknown) => void, reject!: (e?: unknown) => void;
            const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
            return { promise, resolve, reject };
          };
        }
        const pdfjsLib: any = await import("pdfjs-dist");
        // Worker bundleado desde el mismo paquete (extensión .mjs correcta para v4)
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const ab  = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        const partes: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc   = await page.getTextContent();
          partes.push(tc.items.map((it: any) => it.str).join(" "));
        }
        txt = partes.join("\n");
      } else if (/\.docx?$/.test(nombre)) {
        const mammoth = await import("mammoth");
        const ab = await file.arrayBuffer();
        const r  = await mammoth.extractRawText({ arrayBuffer: ab });
        txt = r.value;
      } else if (nombre.endsWith(".txt")) {
        txt = await file.text();
      } else {
        throw new Error("Formato no soportado. Usá PDF, Word (.docx) o TXT.");
      }
      txt = txt.trim();
      if (!txt) throw new Error("No se pudo extraer texto. Puede ser un PDF escaneado (imagen).");
      setTexto(txt);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al leer el archivo.");
    } finally { setCargandoDoc(false); }
  }

  const chars  = texto.length;
  const barPct = Math.round(progress * 100);

  return (
    <section className="flex-1 w-full max-w-3xl mx-auto px-6 sm:px-8 py-16 flex flex-col">
      <motion.h2 initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
        className="font-black text-navy mb-2" style={{ fontSize:"clamp(2rem,6vw,3.5rem)", letterSpacing:"-0.04em" }}>
        Lectura
      </motion.h2>
      <p className="text-navy/45 mb-8">Pegá texto o subí un PDF / Word. Escuchá por partes y descargá el MP3.</p>

      {/* Textarea */}
      <div className="relative" onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) cargarArchivo(f); }}
        onDragOver={e => e.preventDefault()}>
        <GlassTextarea value={texto} onChange={e => setTexto(e.target.value)} disabled={leyendo}
          placeholder="Pegá el texto o arrastrá un archivo acá…" rows={9}
          className="glass-lite w-full resize-none bg-navy/[0.03] rounded-2xl px-6 py-5 text-navy text-base leading-relaxed border border-navy/[0.08] focus:outline-none focus:border-ocre/50 transition-all placeholder:text-navy/25 disabled:opacity-60" />
        <span className="absolute bottom-4 right-5 text-navy/25 text-xs tabular-nums">{chars.toLocaleString()} chars</span>
      </div>

      {/* Cargar / limpiar */}
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) cargarArchivo(f); e.target.value = ""; }} />
        <GlassButton onClick={() => inputRef.current?.click()} disabled={cargandoDoc || leyendo}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-navy/15 text-navy/60 text-sm hover:border-navy/30 hover:text-navy transition-colors disabled:opacity-40">
          {cargandoDoc ? <><span className="animate-spin text-ocre">◌</span> Leyendo archivo…</> : <><span>📄</span> Subir PDF, Word o TXT</>}
        </GlassButton>
        {texto && !leyendo && (
          <button onClick={() => setTexto("")}
            className="text-navy/30 text-xs hover:text-navy/60 transition-colors">Limpiar</button>
        )}
      </div>

      {/* Selector de voz + velocidad */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-navy/40 uppercase tracking-wider mb-2">Voz</label>
          <GlassSelect value={vozIdx} onChange={e => setVozIdx(+e.target.value)}
            className="w-full bg-navy/3 rounded-xl px-4 py-2.5 text-navy text-sm font-medium border border-navy/8 focus:outline-none focus:ring-2 focus:ring-ocre/40">
            {voces.map((v, i) => <option key={i} value={i}>{v.name} ({v.lang})</option>)}
            {!voces.length && <option>Cargando voces…</option>}
          </GlassSelect>
        </div>
        <div>
          <label className="block text-xs text-navy/40 uppercase tracking-wider mb-2">
            Velocidad <span className="text-ocre font-semibold">{velocidad}×</span>
          </label>
          <input type="range" min={0.5} max={2} step={0.1} value={velocidad}
            onChange={e => setVelocidad(+e.target.value)} className="w-full mt-1" />
        </div>
      </div>

      {/* ── Reproductor por partes ── */}
      {capitulos.length > 0 && (
        <div className="glass-lite mt-8 rounded-2xl border border-navy/10 bg-navy/[0.02] p-5 sm:p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-navy/55 text-sm font-medium tabular-nums">
              Parte {Math.min(capIdx + 1, capitulos.length)} de {capitulos.length}
            </span>
            <span className="text-ocre text-xs font-medium h-4">
              {leyendo ? "Reproduciendo…" : pausado ? "Pausado" : ""}
            </span>
          </div>

          {/* Barra: avanza mientras suena y salta al tocarla */}
          <button type="button" aria-label="Elegir parte"
            onClick={e => seekBar(e.clientX, e.currentTarget)}
            className="relative w-full h-4 rounded-full bg-navy/10 cursor-pointer select-none group">
            <div className="absolute inset-y-0 left-0 bg-ocre rounded-full" style={{ width: `${barPct}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-ocre shadow-md ring-2 ring-canvas transition-transform group-hover:scale-110"
              style={{ left: `${Math.max(2, Math.min(98, barPct))}%` }} />
          </button>

          {/* Controles: principio · atrás · play/pausa · adelante */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <GlassButton onClick={irInicio} disabled={capIdx <= 0 && !leyendo} aria-label="Volver al principio"
              className="w-11 h-11 rounded-full border-2 border-navy/15 text-navy/55 hover:border-navy/40 hover:text-navy transition-colors disabled:opacity-30 text-base">↺</GlassButton>
            <GlassButton onClick={() => irAParte(capIdx - 1)} disabled={capIdx <= 0} aria-label="Parte anterior"
              className="w-12 h-12 rounded-full border-2 border-navy/15 text-navy/60 hover:border-navy/40 hover:text-navy transition-colors disabled:opacity-30 text-lg">⏮</GlassButton>
            <GlassButton onClick={togglePlay} aria-label={leyendo ? "Pausar" : "Escuchar"}
              className={`w-16 h-16 rounded-full font-bold text-xl shadow-lg transition-all active:scale-95 ${
                leyendo ? "bg-ocre text-navy hover:bg-ocre-light" : "bg-navy text-canvas hover:bg-navy-soft"
              }`}>
              {leyendo ? "⏸" : "▶"}
            </GlassButton>
            <GlassButton onClick={() => irAParte(capIdx + 1)} disabled={capIdx >= capitulos.length - 1} aria-label="Parte siguiente"
              className="w-12 h-12 rounded-full border-2 border-navy/15 text-navy/60 hover:border-navy/40 hover:text-navy transition-colors disabled:opacity-30 text-lg">⏭</GlassButton>
          </div>
          <p className="text-center text-navy/35 text-xs mt-4">↺ principio · ⏮ atrás · ⏭ adelante · o tocá la barra</p>
        </div>
      )}

      {/* ── Descargar MP3 ── */}
      <div className="mt-8">
        <GlassButton onClick={descargarMp3} disabled={!texto.trim() || descargando}
          className="px-8 py-3.5 rounded-full border-2 border-ocre text-ocre-dark font-semibold hover:bg-ocre hover:text-navy transition-all disabled:opacity-40 flex items-center gap-2">
          {descargando
            ? <><span className="animate-spin">◌</span> Generando MP3… {mp3Pct}%</>
            : <><span>⬇</span> Descargar como .mp3</>}
        </GlassButton>
        {descargando && (
          <div className="mt-3 h-1 rounded-full bg-navy/8 overflow-hidden max-w-xs">
            <div className="h-full bg-ocre rounded-full transition-[width] duration-200 ease-linear" style={{ width: `${mp3Pct}%` }} />
          </div>
        )}
        <p className="text-navy/30 text-xs mt-3">En Safari/iPhone puede que la descarga no funcione; usá Chrome.</p>
      </div>

      <AnimatePresence>
        {error && (
          <GlassCard tint="ocre" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            className="mt-5 px-5 py-4 rounded-xl border text-sm"
            style={{ background:"rgba(201,162,39,0.08)", borderColor:"rgba(201,162,39,0.3)", color:"rgba(11,31,77,0.7)" }}>
            {error}
          </GlassCard>
        )}
      </AnimatePresence>
    </section>
  );
}
