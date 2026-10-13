/**
 * B5 — Permisos granulares de colaboradores e invitaciones (aceptar / rechazar). Tests sin base de datos: reglas puras
 * del paquete compartido y reglas verificadas sobre la fuente. Las pruebas contra la base están en el e2e local.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GRANTABLE_PERMISSIONS, PERMISSION_CATALOG, ROLE_PERMISSIONS, createInvitationSchema, effectivePermissions, hasPermission,
  permissionsNotGrantableBy, updateUserSchema, userPermissionsSchema,
} from "@peregrinos/shared";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("B5: catálogo de permisos", () => {
  it("el SUPERADMIN tiene todos los permisos del catálogo", () => {
    for (const p of GRANTABLE_PERMISSIONS) assert.ok(ROLE_PERMISSIONS.SUPERADMIN.has(p), p);
  });
  it("lo propio del SUPERADMIN nunca es concedible", () => {
    for (const p of ["user:manage", "backup:run", "audit:read"]) assert.ok(!(GRANTABLE_PERMISSIONS as readonly string[]).includes(p), p);
  });
  it("cada permiso del catálogo tiene grupo, etiqueta y descripción, sin repetidos", () => {
    assert.equal(new Set(PERMISSION_CATALOG.map((p) => p.id)).size, PERMISSION_CATALOG.length);
    for (const p of PERMISSION_CATALOG) assert.ok(p.group && p.label && p.description, p.id);
  });
  it("los niveles existentes no ganan permisos nuevos por defecto (solo chat:moderate del ADMIN, que ya moderaba)", () => {
    for (const p of ["parish:profile", "notice:send", "stream:manage", "tracking:read", "certificate:manage", "donation:manage", "inventory:manage", "group:manage", "agenda:manage", "post:manage"]) {
      assert.ok(!ROLE_PERMISSIONS.ADMIN.has(p as never), `ADMIN ${p}`);
      assert.ok(!ROLE_PERMISSIONS.OPERATOR.has(p as never), `OPERATOR ${p}`);
    }
    assert.ok(ROLE_PERMISSIONS.ADMIN.has("chat:moderate"));
    assert.ok(!ROLE_PERMISSIONS.OPERATOR.has("chat:moderate"));
  });
});

describe("B5: permisos efectivos", () => {
  it("un extra del catálogo se suma al nivel", () => {
    assert.ok(hasPermission("OPERATOR", ["stream:manage"], "stream:manage"));
    assert.ok(!hasPermission("OPERATOR", [], "stream:manage"));
  });
  it("un extra fuera del catálogo (aunque esté guardado) no concede nada", () => {
    assert.ok(!effectivePermissions("OPERATOR", ["user:manage", "audit:read", "inventado:todo"]).some((p) => ["user:manage", "audit:read"].includes(p)));
  });
});

describe("B5: mínimo privilegio al otorgar", () => {
  it("el SUPERADMIN puede otorgar todo el catálogo", () => {
    assert.deepEqual(permissionsNotGrantableBy({ role: "SUPERADMIN", extraPermissions: [] }, [...GRANTABLE_PERMISSIONS]), []);
  });
  it("un ADMIN no otorga permisos que no tiene", () => {
    assert.deepEqual(permissionsNotGrantableBy({ role: "ADMIN", extraPermissions: [] }, ["stream:manage", "checkin:read"]), ["stream:manage"]);
  });
  it("un colaborador otorga solo lo que le otorgaron", () => {
    const granter = { role: "ADMIN" as const, extraPermissions: ["donation:manage"] };
    assert.deepEqual(permissionsNotGrantableBy(granter, ["donation:manage"]), []);
    assert.deepEqual(permissionsNotGrantableBy(granter, ["inventory:manage"]), ["inventory:manage"]);
  });
  it("nadie otorga permisos fuera del catálogo", () => {
    assert.deepEqual(permissionsNotGrantableBy({ role: "SUPERADMIN", extraPermissions: [] }, ["user:manage"]), ["user:manage"]);
  });
});

describe("B5: esquemas", () => {
  it("rechazan permisos inexistentes o no concedibles", () => {
    assert.equal(userPermissionsSchema.safeParse({ extraPermissions: ["user:manage"] }).success, false);
    assert.equal(updateUserSchema.safeParse({ extraPermissions: ["todo:todo"] }).success, false);
    assert.equal(createInvitationSchema.safeParse({ email: "a@b.cd", role: "ADMIN", extraPermissions: ["audit:read"] }).success, false);
  });
  it("aceptan permisos del catálogo para cualquier nivel (no solo operadores) y quitan repetidos", () => {
    const r = createInvitationSchema.parse({ email: "a@b.cd", role: "ADMIN", extraPermissions: ["stream:manage", "stream:manage"] });
    assert.deepEqual(r.extraPermissions, ["stream:manage"]);
  });
  it("son estrictos (no se cuela role ni organizationId)", () => {
    assert.equal(userPermissionsSchema.safeParse({ extraPermissions: [], role: "SUPERADMIN" }).success, false);
  });
});

describe("B5: API de permisos e invitaciones (fuente)", () => {
  const users = read("src/routes/users.ts");
  const inv = read("src/routes/invitations.ts");
  it("PUT /users/:id/permissions: user:manage + step-up, misma organización, auditado y cierra sesiones", () => {
    const r = users.slice(users.indexOf('app.put("/:id/permissions"'), users.indexOf("A6: restablecer el MFA"));
    assert.match(r, /preHandler: sensitive/);
    assert.match(users, /const sensitive = \[app\.requirePermission\("user:manage"\), app\.requireRecentMfa\]/);
    assert.match(r, /where: \{ id, \.\.\.staffOf\(req\.auth\.organizationId\) \}/);
    assert.match(r, /assertPermissionChange\(req\.auth, target, extraPermissions\)/);
    assert.match(r, /sessionVersion: \{ increment: 1 \}/);
    assert.match(r, /refreshToken\.updateMany/);
    assert.match(r, /action: "USER_PERMISSIONS_CHANGED"/);
  });
  it("nadie cambia sus propios permisos ni los de un SUPERADMIN; solo otorga lo que tiene", () => {
    const f = users.slice(users.indexOf("function assertPermissionChange"), users.indexOf("export default"));
    assert.match(f, /target\.id === granter\.id/);
    assert.match(f, /target\.role === "SUPERADMIN"/);
    assert.match(f, /permissionsNotGrantableBy\(granter, requested\)/);
  });
  it("editar o crear usuarios con permisos extra pasa por las mismas reglas", () => {
    assert.match(users, /if \(body\.extraPermissions\) assertPermissionChange\(req\.auth, target, body\.extraPermissions\);/);
    assert.match(users.slice(users.indexOf('app.post("/"'), users.indexOf('app.patch("/:id"')), /permissionsNotGrantableBy\(req\.auth, body\.extraPermissions\)/);
  });
  it("invitar y reenviar no permiten otorgar permisos que quien invita no tiene", () => {
    assert.match(inv, /const denied = permissionsNotGrantableBy\(req\.auth, body\.extraPermissions\);/);
    assert.match(inv, /permissionsNotGrantableBy\(req\.auth, inv\.extraPermissions\)\.length/);
  });
  it("rechazar: token vigente, condicional, sin crear cuenta, auditado", () => {
    const r = inv.slice(inv.indexOf('app.post("/decline"'), inv.indexOf("Acepta la invitación"));
    assert.match(r, /where: \{ id: inv\.id, tokenHash: sha256\(token\), \.\.\.OPEN, expiresAt: \{ gt: new Date\(\) \} \}, data: \{ declinedAt: new Date\(\) \}/);
    assert.doesNotMatch(r, /user\.create|issueSession/);
    assert.match(r, /action: "INVITATION_DECLINED"/);
    assert.match(inv, /if \(st === "DECLINED"\) throw new AppError\(410, "INVITATION_DECLINED"/);
  });
  it("moderar el chat es el permiso chat:moderate (no el rol)", () => {
    const chat = read("src/routes/chat.ts");
    assert.match(chat, /canModerate: hasPermission\(req\.auth\.role, req\.auth\.extraPermissions, "chat:moderate"\)/);
    assert.doesNotMatch(chat, /req\.auth\.role === "SUPERADMIN"/);
  });
  it("perfil y avisos de la parroquia exigen sus permisos (no el rol)", () => {
    const org = read("src/routes/organization.ts");
    assert.match(org, /const profileManager = app\.requirePermission\("parish:profile"\);/);
    assert.match(org, /const noticeSender = app\.requirePermission\("notice:send"\);/);
    assert.equal((org.match(/preHandler: profileManager/g) ?? []).length, 4);
    assert.equal((org.match(/preHandler: noticeSender/g) ?? []).length, 2);
    assert.doesNotMatch(org, /requireSuperadmin/);
  });
});
