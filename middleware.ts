import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Protección de rutas (6.1): ninguna página de la app es accesible sin sesión.
// Públicas: solo la puerta de entrada (/login, /registro, /recuperar) y el
// callback de confirmación de email (/auth/confirm). Los /api/* NO pasan por
// acá (ver matcher): cada handler verifica sesión server-side por su cuenta —
// la protección real de datos nunca depende solo del middleware.
// Además de proteger, acá se REFRESCA la sesión (token de 900s) en cada
// navegación, escribiendo las cookies renovadas con atributos endurecidos.

const AUTH_PAGES = new Set(["/login", "/registro", "/recuperar"]);

// Mismos atributos que hardenCookie() de app/lib/supabase/server.ts (no se
// importa para no arrastrar imports de next/headers al edge runtime).
const harden = (o?: object) =>
  ({ ...o, httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" });

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, harden(options)));
        },
      },
    }
  );

  // getUser() valida el JWT contra el servidor de Auth (y refresca si venció).
  // Nunca usar getSession() del lado del server: no verifica la firma.
  const { data: { user } } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const esPublica = AUTH_PAGES.has(path) || path.startsWith("/auth/confirm");

  if (!user && !esPublica) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return conCookies(NextResponse.redirect(url), res);
  }
  if (user && AUTH_PAGES.has(path)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return conCookies(NextResponse.redirect(url), res);
  }
  return res;
}

/** Mueve las cookies (posible refresh de sesión) al response de redirect. */
function conCookies(destino: NextResponse, origen: NextResponse) {
  origen.cookies.getAll().forEach((c) => destino.cookies.set(c));
  return destino;
}

export const config = {
  // Todo menos /api (cada handler se protege solo), assets y archivos estáticos.
  matcher: ["/((?!api|_next/static|_next/image|logos|icon\\.svg|favicon\\.ico).*)"],
};
