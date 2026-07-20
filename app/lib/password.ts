/* Política de contraseñas (v10.10): mínimo 8 caracteres con al menos una
   mayúscula, una minúscula y un número. Fuente ÚNICA compartida entre el
   server (signup, recover/verify, change-password) y el cliente (registro,
   recuperar) — el mismo chequeo y el mismo mensaje en los dos lados.
   Supabase Auth además la fuerza a nivel proyecto (password_required_characters),
   así que ni un request armado a mano la esquiva. */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export const PASSWORD_MSG =
  "La contraseña necesita mínimo 8 caracteres, con al menos una mayúscula, una minúscula y un número.";

/** Etiqueta corta para labels/hints de la UI. */
export const PASSWORD_HINT = "Mínimo 8 caracteres, con mayúscula, minúscula y número.";

export function passwordValida(p: string): boolean {
  return (
    p.length >= PASSWORD_MIN &&
    p.length <= PASSWORD_MAX &&
    /[A-Z]/.test(p) &&
    /[a-z]/.test(p) &&
    /[0-9]/.test(p)
  );
}
