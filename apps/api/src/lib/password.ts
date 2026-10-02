import argon2 from "argon2";

const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => argon2.hash(plain, OPTS);
export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain).catch(() => false);

// Hash falso para igualar tiempos cuando el email no existe (evita enumeración de usuarios).
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= argon2.hash("dummy-password-for-timing", OPTS));
