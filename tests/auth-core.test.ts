import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthError,
  hashPassword,
  normalizeUsername,
  sessionCookie,
  validateUsername,
  verifyPassword,
} from "../lib/server/auth.ts";

test("normaliza usuarios sin alterar caracteres válidos", () => {
  assert.equal(normalizeUsername("  Brayan.Puentes@APPGATE.COM  "), "brayan.puentes@appgate.com");
  assert.equal(validateUsername("lider_turno-2"), "lider_turno-2");
});

test("rechaza nombres de usuario inválidos", () => {
  assert.throws(
    () => validateUsername("dos palabras"),
    (error) => error instanceof AuthError && error.code === "INVALID_USERNAME",
  );
});

test("deriva y verifica contraseñas sin guardar texto visible", async () => {
  const password = "Operacion-2026-segura";
  const stored = await hashPassword(password);
  assert.notEqual(stored.hash, password);
  assert.equal(await verifyPassword(password, stored.hash, stored.salt, stored.iterations), true);
  assert.equal(await verifyPassword("Otra-clave-2026", stored.hash, stored.salt, stored.iterations), false);
});

test("la cookie de sesión es HttpOnly y solo marca Secure sobre HTTPS", () => {
  const local = sessionCookie(new Request("http://localhost:4173/"), "token");
  const hosted = sessionCookie(new Request("https://example.com/"), "token");
  assert.match(local, /HttpOnly/);
  assert.match(local, /SameSite=Lax/);
  assert.doesNotMatch(local, /; Secure/);
  assert.match(hosted, /; Secure/);
});

