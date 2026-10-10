#!/usr/bin/env node
/**
 * LAT-12828 — scoped Directus-identity voor de dagelijkse CJ-commissie-import.
 * User cj-importer@vinomartino.com, geen rol, policy "cj-importer-commissions" met alleen
 * read/create/update op affiliate_commissions (geen delete, geen andere collecties).
 * Statisch token wordt hier gegenereerd en NOOIT plain gelogd: alleen RSA-OAEP-versleuteld met de
 * publieke sleutel hieronder (privésleutel bij de DevOps-agent) plus een sha256-prefix.
 * Herdraaien = idempotent op policy/permissies/access, en roteert het token.
 * Run: GHA lat12804-directus-schema-migrate.yml (admin).
 */
import crypto from "node:crypto";
const U = process.env.DIRECTUS_URL, T = process.env.DIRECTUS_TOKEN;
if (!U || !T) { console.error("DIRECTUS_URL/DIRECTUS_TOKEN required"); process.exit(1); }
const PUB = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEArIgRx01bRE7fRXG/kqH8
ccEkY5Qy45zugwM7WrwVhOd8BfFgBXdMo4QwsqER1/prqfFXQmfMyjWRslTn0wJp
L3S45WJPyZ6dtmiaJC3LwqxwjYUHLoLcd4nKqUNx7OjJvW+c9xZtcR43fjT19JDL
C9l7JMV0EWceRnHTsyv5H320L5MhsiBWfRvNqY5pgGwDE0HNvgGvzpOIqvDRxQsB
n1+rfKKRbtmmvQWVwJcnJFSMkuVozsTbDv60x0WTwsTGk/im5gDM319VnnQfRcbL
Ww9iKkBxtag1HcZUqg/q8858p6w9tUan3y7adPLmUsuSyHyHXJqwjTpy64lTh2KN
lRpLyBsPeRj3jzqqNV0E64NB/X8sy/pDeK/GD4iSE8d+nvsoVTNQdl1CYomybmlz
adXZmVovkC7RSNBJl1/LcgE4pZGlOQt1GRnjrHdCSNg+rUVdMHl/k8lTTCAyAnQ5
jIxVVqQI98ePbID7/fvPxdc4YxR89gB+HO9cstRQJU3TAgMBAAE=
-----END PUBLIC KEY-----`;
const EMAIL = "cj-importer@vinomartino.com", PNAME = "cj-importer-commissions", C = "affiliate_commissions";
async function api(method, path, body, tok = T) {
  const r = await fetch(U + path, { method, headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = null; }
  return { status: r.status, ok: r.ok, j, text };
}
function must(r, what) { if (!r.ok) { console.error(`${what} FAIL ${r.status} ${r.text.slice(0, 200)}`); process.exit(1); } return r.j?.data; }

let pol = must(await api("GET", `/policies?fields=id&filter[name][_eq]=${PNAME}`), "policy lookup")[0];
if (!pol) pol = must(await api("POST", "/policies", { name: PNAME, icon: "payments", description: "LAT-12828: dagelijkse CJ-import, alleen affiliate_commissions r/c/u", admin_access: false, app_access: false, enforce_tfa: false }), "policy create");
console.log(`policy ${pol.id}`);

const q = `/permissions?limit=-1&fields=id,action&filter[policy][_eq]=${pol.id}`;
const have = must(await api("GET", q), "perm lookup");
for (const action of ["read", "create", "update"]) {
  if (have.some((p) => p.action === action)) continue;
  must(await api("POST", "/permissions", { policy: pol.id, collection: C, action, fields: ["*"], permissions: {}, validation: {} }), `perm ${action}`);
}
const extra = have.filter((p) => !["read", "create", "update"].includes(p.action));
if (extra.length) { console.error(`onverwachte permissies op policy: ${extra.map((p) => p.action)}`); process.exit(1); }

const tok = crypto.randomBytes(32).toString("hex");
let user = must(await api("GET", `/users?fields=id&filter[email][_eq]=${EMAIL}`), "user lookup")[0];
if (!user) user = must(await api("POST", "/users", { email: EMAIL, first_name: "cj", last_name: "importer", status: "active", role: null, token: tok }), "user create");
else must(await api("PATCH", `/users/${user.id}`, { token: tok, status: "active", role: null }), "user token");
console.log(`user ${user.id}`);

const acc = must(await api("GET", `/access?fields=id&filter[user][_eq]=${user.id}&filter[policy][_eq]=${pol.id}`), "access lookup");
if (!acc.length) must(await api("POST", "/access", { user: user.id, policy: pol.id, role: null }), "access create");

// Verificatie met het nieuwe token: eigen collectie 200, andere collectie geweigerd.
const me = await api("GET", "/users/me?fields=email", null, tok);
const own = await api("GET", `/items/${C}?limit=1&fields=click_id`, null, tok);
const other = await api("GET", "/items/articles?limit=1&fields=id", null, tok);
console.log(`verify users/me=${me.status} ${C}=${own.status} articles=${other.status}`);
if (me.status !== 200 || own.status !== 200 || other.status === 200) { console.error("scope-verificatie faalt"); process.exit(1); }

const enc = crypto.publicEncrypt({ key: PUB, oaepHash: "sha256", padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(tok)).toString("base64");
console.log(`token len=${tok.length} sha256=${crypto.createHash("sha256").update(tok).digest("hex").slice(0, 16)}`);
console.log(`CJ_TOKEN_ENC=${enc}`);
