import { NextResponse } from "next/server";

export const runtime = "edge";

const VOCES: Record<string,string> = {
  rachel:"21m00Tcm4TlvDq8ikWAM", antoni:"ErXwobaYiN019PkySvjV",
  bella:"EXAVITQu4vr4xnSDxMaL",  adam:"pNInz6obpgDQGcFmaJgB",
};

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error:"Falta ELEVENLABS_API_KEY." }, { status:500 });
  const { texto, voz } = await req.json();
  if (!texto?.trim()) return NextResponse.json({ error:"Texto vacío." }, { status:400 });
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOCES[voz]??VOCES.rachel}`, {
    method:"POST",
    headers:{"xi-api-key":key,"Content-Type":"application/json",Accept:"audio/mpeg"},
    body:JSON.stringify({ text:texto.slice(0,5000), model_id:"eleven_multilingual_v2", voice_settings:{stability:0.5,similarity_boost:0.75} }),
  });
  if (!r.ok) return NextResponse.json({ error:"ElevenLabs error." }, { status:r.status });
  return new Response(r.body, { headers:{"Content-Type":"audio/mpeg"} });
}
