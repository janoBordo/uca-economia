// Cache en memoria (por instancia) de las signed URLs del avatar.
// El bucket es privado y la URL firmada dura 1h — eso NO cambia. Lo que se
// evita es firmar una URL NUEVA en cada GET de perfil: reusando la misma
// durante ~55min el navegador puede cachear la imagen (misma URL ⇒ cache hit,
// menos egress de Storage) y se ahorra una llamada a Storage por request.
// Se invalida al subir o quitar la foto. Clave = path (<user_id>.<ext>).

const cache = new Map<string, { url: string; hasta: number }>();
const REUSO_MS = 55 * 60 * 1000; // 5 min de margen antes de que venza la firma (1h)

export function avatarUrlCacheada(path: string): string | null {
  const e = cache.get(path);
  if (e && e.hasta > Date.now()) return e.url;
  if (e) cache.delete(path);
  return null;
}

export function guardarAvatarUrl(path: string, url: string) {
  if (cache.size > 5000) cache.clear(); // techo de memoria; se re-firma y ya
  cache.set(path, { url, hasta: Date.now() + REUSO_MS });
}

export function invalidarAvatarUrl(userId: string) {
  for (const ext of ["jpg", "png", "webp"]) cache.delete(`${userId}.${ext}`);
}
