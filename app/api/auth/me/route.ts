import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../../lib/supabase/server";
import { rlDb, rlDbIp, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit-local";

// Usuario de la sesión actual ("quién soy"). Solo id + email: las cookies son
// HttpOnly, así que el JS del navegador no puede leer el JWT — este endpoint
// es la única forma de conocer la identidad de la sesión desde el cliente.

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Reja por IP anti-inundación; el límite fino va por usuario (v10.14): con
  // una IP compartida (wifi de facultad) contar por IP castigaba a todos.
  const limIp = await checkLimit(rlDbIp, `me:${clientIp(req)}`, false);
  if (!limIp.ok) return tooMany(limIp.retryAfter);

  const supabase = supabaseForRequest(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });

  const lim = await checkLimit(rlDb, `me:${data.user.id}`, false);
  if (!lim.ok) return tooMany(lim.retryAfter);

  return NextResponse.json({
    ok: true,
    user: { id: data.user.id, email: data.user.email ?? null },
  });
}
