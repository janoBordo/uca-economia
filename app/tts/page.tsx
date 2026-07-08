"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassButton, GlassSelect, GlassTextarea, GlassCard } from "../components/glass";

// Lectura:
// - Escuchar con Web Speech (voz del navegador): gratis, sin límite, por CAPÍTULOS
//   con volver atrás / adelantar como un podcast.
// - Descargar .mp3 real: el cliente parte el texto y pide cada trozo a /api/tts
//   (proxy al TTS gratuito de Google) y concatena todo en un solo archivo.
//   No graba pantalla, no toca la base de datos, no agrega peso al cliente.

// Divide el texto en "capítulos" (oraciones agrupadas ~240 chars) para navegar.
function dividirEnCapitulos(txt: string): string[] {
  const limpio = txt.replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  const oraciones = limpio.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) ?? [limpio];
  const caps: string[] = [];
  let buf = "";
  for (const o of oraciones) {
    const frag = o.trim();
    if (!frag) continue;
    if (buf && (buf + " " + frag).length > 240) { caps.push(buf); buf = frag; }
    else buf = buf ? buf + " " + frag : frag;
  }
  if (buf) caps.push(buf);
  return caps;
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
  const [capIdx,      setCapIdx]      = useState(0);   // capítulo actual

  const [descargando, setDescargando] = useState(false);
  const [mp3Pct,      setMp3Pct]      = useState(0);

  const utterRef  = useRef<SpeechSynthesisUtterance | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const velRef    = useRef(1);       // velocidad viva para el encadenado onend
  const vozRef    = useRef(0);
  const listaRef  = useRef<HTMLDivElement>(null);

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
    setLeyendo(false); setPausado(false); setCapIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  // Frenar al desmontar
  useEffect(() => () => detenerVoz(), []);

  // ── Reproducción por capítulos ──
  function detenerVoz() {
    if (utterRef.current) utterRef.current.onend = null;  // evita que se dispare el encadenado
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  }

  function reproducirDesde(idx: number) {
    if (!capitulos.length) return;
    detenerVoz();
    const i = Math.max(0, Math.min(idx, capitulos.length - 1));
    setCapIdx(i);

    const utter = new SpeechSynthesisUtterance(capitulos[i]);
    const v = voces[vozRef.current];
    if (v) utter.voice = v;
    utter.rate = velRef.current;
    utter.lang = v?.lang ?? "es-AR";
    utter.onend = () => {
      const next = i + 1;
      if (next < capitulos.length) reproducirDesde(next);
      else { setLeyendo(false); setPausado(false); setCapIdx(capitulos.length); }  // terminó: 100%
    };
    utter.onerror = () => { setLeyendo(false); setPausado(false); };

    utterRef.current = utter;
    setLeyendo(true); setPausado(false);
    window.speechSynthesis.speak(utter);
    window.speechSynthesis.resume();   // iOS a veces arranca pausado
  }

  // Botón central: play / pausa / reanudar / reiniciar
  function togglePlay() {
    if (!capitulos.length) return;
    if (!leyendo) {
      reproducirDesde(capIdx >= capitulos.length ? 0 : capIdx);
    } else if (pausado) {
      window.speechSynthesis.resume(); setPausado(false);
    } else {
      window.speechSynthesis.pause(); setPausado(true);
    }
  }

  function saltar(delta: number) {
    const destino = Math.max(0, Math.min(capIdx + delta, capitulos.length - 1));
    if (leyendo) reproducirDesde(destino);   // como un podcast: salta y sigue sonando
    else setCapIdx(destino);
  }

  function irACapitulo(i: number) {
    reproducirDesde(i);   // clic en la lista = escuchar esa parte desde ahí
  }

  function detenerTodo() {
    detenerVoz();
    setLeyendo(false); setPausado(false); setCapIdx(0);
  }

  // Mantener el capítulo activo visible en la lista
  useEffect(() => {
    const cont = listaRef.current;
    const el = cont?.querySelector<HTMLElement>(`[data-cap="${capIdx}"]`);
    if (el && cont) {
      const top = el.offsetTop - cont.offsetTop - cont.clientHeight / 2 + el.clientHeight / 2;
      cont.scrollTo({ top, behavior: "smooth" });
    }
  }, [capIdx]);

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

  const chars    = texto.length;
  const progreso = capitulos.length ? Math.min(capIdx, capitulos.length) / capitulos.length : 0;

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
          className="w-full resize-none bg-navy/[0.03] rounded-2xl px-6 py-5 text-navy text-base leading-relaxed border border-navy/[0.08] focus:outline-none focus:border-ocre/50 transition-all placeholder:text-navy/25 disabled:opacity-60" />
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

      {/* ── Reproductor por capítulos ── */}
      {capitulos.length > 0 && (
        <div className="mt-8 rounded-3xl border border-navy/10 bg-navy/[0.02] p-5 sm:p-6">
          {/* Barra de progreso */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-navy/45 text-xs font-medium tabular-nums">
              Parte {Math.min(capIdx + 1, capitulos.length)} de {capitulos.length}
            </span>
            <span className="text-navy/30 text-xs">{Math.round(progreso * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-navy/8 overflow-hidden mb-5">
            <motion.div className="h-full bg-ocre rounded-full"
              animate={{ width: `${progreso * 100}%` }} transition={{ ease:"linear", duration:0.3 }} />
          </div>

          {/* Transporte */}
          <div className="flex items-center justify-center gap-4 mb-5">
            <GlassButton onClick={() => saltar(-1)} disabled={capIdx <= 0}
              className="w-12 h-12 rounded-full border-2 border-navy/15 text-navy/60 hover:border-navy/40 hover:text-navy transition-colors text-lg disabled:opacity-30">
              ⏮
            </GlassButton>
            <GlassButton onClick={togglePlay}
              className={`w-16 h-16 rounded-full font-bold text-xl shadow-lg transition-all active:scale-95 ${
                leyendo && !pausado ? "bg-ocre text-navy hover:bg-ocre-light" : "bg-navy text-canvas hover:bg-navy-soft"
              }`}>
              {leyendo && !pausado ? "⏸" : "▶"}
            </GlassButton>
            <GlassButton onClick={() => saltar(1)} disabled={capIdx >= capitulos.length - 1}
              className="w-12 h-12 rounded-full border-2 border-navy/15 text-navy/60 hover:border-navy/40 hover:text-navy transition-colors text-lg disabled:opacity-30">
              ⏭
            </GlassButton>
            {leyendo && (
              <GlassButton onClick={detenerTodo}
                className="w-12 h-12 rounded-full border-2 border-navy/15 text-navy/40 hover:border-ocre/60 hover:text-ocre transition-colors text-sm">
                ⏹
              </GlassButton>
            )}
          </div>
          <p className="text-center text-navy/35 text-xs mb-4">
            ⏮ atrás · ▶ escuchar / ⏸ pausar · ⏭ adelante — o tocá cualquier parte de la lista
          </p>

          {/* Lista de capítulos: seleccionar la parte a escuchar */}
          <div ref={listaRef} className="max-h-64 overflow-y-auto rounded-2xl border border-navy/8 bg-canvas/60 divide-y divide-navy/6">
            {capitulos.map((c, i) => (
              <button key={i} data-cap={i} onClick={() => irACapitulo(i)}
                className={`w-full text-left px-4 py-3 flex gap-3 transition-colors ${
                  i === capIdx ? "bg-ocre/10" : "hover:bg-navy/[0.03]"
                }`}>
                <span className={`shrink-0 text-xs tabular-nums font-semibold mt-0.5 ${i === capIdx ? "text-ocre-dark" : "text-navy/30"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`text-sm leading-snug ${i === capIdx ? "text-navy font-medium" : "text-navy/55"}`}>
                  {c.length > 140 ? c.slice(0, 140) + "…" : c}
                </span>
              </button>
            ))}
          </div>
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
            <motion.div className="h-full bg-ocre rounded-full" animate={{ width: `${mp3Pct}%` }} transition={{ ease:"linear", duration:0.2 }} />
          </div>
        )}
        <p className="text-navy/30 text-xs mt-3">
          El .mp3 se arma en el momento con una voz de servidor gratuita. No se guarda nada en la nube ni ocupa espacio en tu cuenta.
        </p>
        <p className="text-navy/30 text-xs mt-1">
          Para escuchar en vivo se usa la voz del dispositivo. En iPhone, revisá que el switch de silencio esté apagado y el volumen arriba.
        </p>
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
