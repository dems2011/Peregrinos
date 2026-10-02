import { createHash, randomBytes } from "node:crypto";

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Token opaco aleatorio. En BD solo se guarda su hash. */
export function newOpaqueToken() {
  const raw = randomBytes(48).toString("base64url");
  return { raw, hash: sha256(raw) };
}

/** Token del QR del participante: opaco, sin datos personales. */
export const newQrToken = () => randomBytes(24).toString("base64url");
