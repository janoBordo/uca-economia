import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseForRequest, supabaseAdmin } from "../../../lib/supabase/server";
import { rlDeleteAccount, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";

// Eliminar cuenta (sección 6.16): SOFT DELETE reversible.
// - Marca profiles.deleted_at (los datos quedan intactos por si fue un error).
// - Banea al usuario en Auth (no puede volver a loguearse).
// - Revoca todas las sesiones en todos los dispositivos.
// El hard delete definitivo (ON DELETE CASCADE desde auth.users) lo hace el
// job de backups llamando a purge_deleted_accounts(30) — 30 días de gracia.
// Sin UI todavía — la pantalla con confirmación inline llega en fase posterior.

export const runtime = "nodejs";

const Body = z.object({
  // Confirmación explícita: el front la manda solo tras la confirmación inline.
  confirmar: z.literal("ELIMINAR MI CUENTA"),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipLimit = await checkLimit(rlDeleteAccount, `ip:${ip}`, true);
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfter);

  const supabase = supabaseForRequest(req);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  }
  const user = userData.user;

  try {
    Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Falta la confirmación." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // 1. Soft delete: marcar el perfil (datos intactos, cuenta recuperable 30 días)
  const { error: profError } = await admin
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", user.id);
  if (profError) {
    console.error("delete-account: no se pudo marcar el perfil", profError.message);
    return NextResponse.json(
      { ok: false, error: "No se pudo eliminar la cuenta." },
      { status: 500 }
    );
  }

  // 2. Bloquear el login (ban largo; la purga definitiva llega antes)
  const { error: banError } = await admin.auth.admin.updateUserById(user.id, {
    ban_duration: "87600h", // 10 años — la cuenta se purga en serio a los 30 días
  });
  if (banError) console.error("delete-account: ban falló", banError.message);

  // 3. Cerrar sesión en TODOS los dispositivos (incluido este)
  const { error: soError } = await supabase.auth.signOut({ scope: "global" });
  if (soError) {
    // Con Authorization: Bearer no hay sesión en el storage del cliente y el
    // signOut de arriba no aplica — se revoca por admin con el token del
    // request, para que las filas de auth.sessions mueran igual (v10.5).
    console.error("delete-account: signOut global falló", soError.message);
    const auth = req.headers.get("authorization");
    const token = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;
    if (token) {
      const { error: adminSoErr } = await admin.auth.admin.signOut(token, "global");
      if (adminSoErr) console.error("delete-account: signOut admin falló", adminSoErr.message);
    }
  }

  return NextResponse.json({ ok: true });
}
