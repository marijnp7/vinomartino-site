// LAT-12642: geef de content-writer-rol create/update op `reispakketten`
// (lezen werkte al, POST gaf 403). Spiegelt de create/update-permissie die
// dezelfde policy op `articles` heeft, zodat fields/validation gelijk lopen.
// Default dry-run; schrijf met --apply.
const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const APPLY = process.argv.includes('--apply');
if (!DIRECTUS_TOKEN) throw new Error('DIRECTUS_TOKEN ontbreekt');

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text).data : null;
}

const roles = await api('GET', '/roles?limit=-1&fields=id,name');
const role = roles.find((r) => /content[\s_-]*writer/i.test(r.name));
if (!role) throw new Error(`geen content-writer-rol; rollen: ${roles.map((r) => r.name).join(', ')}`);
const access = await api('GET', `/access?limit=-1&fields=policy&filter[role][_eq]=${role.id}`);
const policies = access.map((a) => (typeof a.policy === 'object' ? a.policy.id : a.policy));
console.log(`rol ${role.name} (${role.id}) policies: ${policies.join(', ')}`);

for (const action of ['create', 'update']) {
  const have = await api('GET', `/permissions?limit=-1&filter[policy][_in]=${policies.join(',')}&filter[collection][_eq]=reispakketten&filter[action][_eq]=${action}`);
  if (have.length) { console.log(`reispakketten.${action}: bestaat al (policy ${have[0].policy}) — skip`); continue; }
  const tmpl = (await api('GET', `/permissions?limit=-1&filter[policy][_in]=${policies.join(',')}&filter[collection][_eq]=articles&filter[action][_eq]=${action}`))[0];
  const perm = {
    policy: tmpl?.policy ?? policies[0],
    collection: 'reispakketten',
    action,
    fields: ['*'],
    permissions: tmpl?.permissions ?? {},
    validation: tmpl?.validation ?? {},
    presets: tmpl?.presets ?? null,
  };
  console.log(`reispakketten.${action}: ${APPLY ? 'aanmaken' : 'DRY-RUN zou aanmaken'} ${JSON.stringify(perm)} (sjabloon articles: ${tmpl ? 'ja' : 'nee'})`);
  if (APPLY) await api('POST', '/permissions', perm);
}
