import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../../lib/supabase/server";

// Cerrar sesión (6.1 — logout REAL): signOut scope "local" revoca el refresh
// token de ESTA sesión en el servidor de Auth (no solo borra cookies del
// cliente) y @supabase/ssr limpia las cookies en la respuesta. El access token
// ya emitido muere solo (jwt_exp 900s) y el navegador ya no lo tiene.
// Cerrar TODAS las sesiones queda para cambio de contraseña, no para logout.

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = supabaseForRequest(req);
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) console.error("auth/logout:", error.message); // cookies se limpian igual
  return NextResponse.json({ ok: true });
}
