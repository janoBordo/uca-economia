import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../../lib/supabase/server";
import { rlDb, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";

// Usuario de la sesión actual, para la UI (hook useUser). Solo id + email:
// las cookies son HttpOnly, así que el cliente no puede leer el JWT — este
// endpoint es la única forma de saber "quién soy" desde el navegador.

export const runtime = "nodejs";

export async function GET(req: Request) {
  const lim = await checkLimit(rlDb, `me:${clientIp(req)}`, false);
  if (!lim.ok) return tooMany(lim.retryAfter);

  const supabase = supabaseForRequest(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });

  return NextResponse.json({
    ok: true,
    user: { id: data.user.id, email: data.user.email ?? null },
  });
}
