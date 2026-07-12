import { NextResponse } from "next/server";
import { rlTts, checkLimit, clientIp, tooMany } from "../../lib/ratelimit";
import { supabaseForRequest } from "../../lib/supabase/server";

// Proxy liviano al TTS gratuito de Google Translate.
// - No usa API key ni servicios pagos (nada de ElevenLabs).
// - No toca la base de datos (Vercel KV): sólo reenvía audio.
// - Devuelve MP3 real por trozo; el cliente concatena y arma el archivo.
// El endpoint acepta ~200 caracteres por request, así que el cliente
// parte el texto y llama una vez por trozo.

export const runtime = "edge";

export async function GET(req: Request) {
  // Rate limit por IP (6.5): sin esto, un bot puede spamear el proxy de TTS.
  const lim = await checkLimit(rlTts, clientIp(req), false);
  if (!lim.ok) return tooMany(lim.retryAfter);

  // Fase 2: sesión obligatoria (verificada server-side) — el proxy no queda
  // abierto a cualquiera con la URL.
  const { data: userData, error: userError } = await supabaseForRequest(req).auth.getUser();
  if (userError || !userData.user)
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q  = (searchParams.get("q") ?? "").slice(0, 200);
  const tl = searchParams.get("tl") ?? "es";
  if (!q.trim()) return NextResponse.json({ error: "Texto vacío." }, { status: 400 });

  const url =
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob` +
    `&tl=${encodeURIComponent(tl)}&total=1&idx=0&textlen=${q.length}` +
    `&q=${encodeURIComponent(q)}`;

  try {
    const r = await fetch(url, {
      headers: {
        // Sin un User-Agent de navegador, Google responde 403.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Referer": "https://translate.google.com/",
      },
    });
    if (!r.ok) return NextResponse.json({ error: "TTS no disponible." }, { status: 502 });
    return new Response(r.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Error contactando el TTS." }, { status: 502 });
  }
}
