/**
 * Descargas en la app Android: el contenedor nativo solo guarda PDF. Cualquier otra descarga debe fallar con un mensaje
 * claro ANTES de pedir nada al servidor (p. ej. «acceso-peregrinos.csv» reemite accesos: en la app se perderían). En el
 * navegador no cambia nada. Sin base de datos ni dispositivo: se simulan `window.Capacitor`, `fetch` y `document`.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiError, download, inNativeApp } from "../../web/src/lib/api";

const g = globalThis as unknown as Record<string, unknown>;
let calls: string[] = [];

function setup(native: boolean) {
  calls = [];
  g.window = native ? { Capacitor: { isNativePlatform: () => true } } : {};
  g.fetch = async (url: string) => { calls.push(url); return new Response("x", { status: 200 }); };
  g.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
}
afterEach(() => { delete g.window; delete g.document; });

describe("S4: descargas en la app nativa", () => {
  it("detecta la app nativa solo con Capacitor", () => {
    setup(false); assert.equal(inNativeApp(), false);
    setup(true); assert.equal(inNativeApp(), true);
  });

  for (const file of ["acceso-peregrinos.csv", "plantilla-participantes.xlsx", "qr-0001.png"]) {
    it(`en la app, ${file} se rechaza sin llamar al servidor`, async () => {
      setup(true);
      await assert.rejects(download("/x", file, { method: "POST" }), (e: unknown) => e instanceof ApiError && e.code === "NATIVE_DOWNLOAD_UNSUPPORTED");
      assert.deepEqual(calls, []);
    });
  }

  it("en la app, un PDF se descarga", async () => {
    setup(true);
    await download("/events/e/report/pdf", "informe.PDF");
    assert.deepEqual(calls, ["/api/events/e/report/pdf"]);
  });

  it("en el navegador, un CSV se descarga como siempre", async () => {
    setup(false);
    await download("/access/export", "acceso-peregrinos.csv", { method: "POST" });
    assert.deepEqual(calls, ["/api/access/export"]);
  });
});
