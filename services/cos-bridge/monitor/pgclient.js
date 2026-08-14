// LAT-5994 — minimale, afhankelijkheidsvrije Postgres-client voor de monitor.
//
// WAAROM GEEN `pg`: het monitor-image is `FROM node:20-alpine` + `COPY` van de
// bronbestanden. Er is geen `npm install` in Dockerfile.monitor en dus geen
// node_modules. Een dependency toevoegen betekent een netwerk-afhankelijke
// build-stap in precies de container die de storing moet zien wanneer alles
// anders stukloopt. 200 regels wire-protocol is die ruil waard.
//
// Dit spreekt het v3 frontend/backend-protocol rechtstreeks: startup, md5- en
// SCRAM-SHA-256-auth, en de simple-query-flow. Read-only per conventie — er is
// hier geen enkele reden om iets te schrijven, dus `query()` weigert alles wat
// niet met select/with begint. Een bewaker die kan schrijven is een bewaker die
// een incident kan veroorzaken.
//
// Node-poort van /paperclip/tools/pgq.py (dezelfde vier auth-paden, dezelfde
// message-parsing) zodat een verschil tussen het agent-pad en het monitor-pad
// niet uit twee ongelijke clients kan komen.
import crypto from "node:crypto";
import net from "node:net";

const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_QUERY_TIMEOUT_MS = 10000;

function cstr(s) {
  return Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);
}

function tagged(tag, body) {
  const head = Buffer.alloc(tag ? 5 : 4);
  let off = 0;
  if (tag) head.write(tag, off++, 1, "ascii");
  head.writeUInt32BE(body.length + 4, off);
  return Buffer.concat([head, body]);
}

function parseErrorResponse(body) {
  const fields = {};
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === 0) {
      if (i > start) fields[String.fromCharCode(body[start])] = body.slice(start + 1, i).toString("utf8");
      start = i + 1;
    }
  }
  return [fields.M || "unknown error", fields.D || ""].filter(Boolean).join(" ");
}

class Conn {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.waiters = [];
    this.fatal = null;
    sock.on("data", (chunk) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      this._drain();
    });
    const die = (err) => {
      this.fatal = this.fatal || err;
      const pending = this.waiters.splice(0);
      for (const w of pending) w.reject(this.fatal);
    };
    sock.on("error", die);
    sock.on("close", () => die(new Error("connection closed by server")));
  }

  _drain() {
    while (this.waiters.length && this.buf.length >= 5) {
      const len = this.buf.readUInt32BE(1);
      if (this.buf.length < len + 1) return;
      const tag = String.fromCharCode(this.buf[0]);
      const body = this.buf.slice(5, len + 1);
      this.buf = this.buf.slice(len + 1);
      this.waiters.shift().resolve({ tag, body });
    }
  }

  msg() {
    if (this.fatal) return Promise.reject(this.fatal);
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this._drain();
    });
  }

  send(tag, body) {
    this.sock.write(tagged(tag, body));
  }

  end() {
    try {
      this.send("X", Buffer.alloc(0));
      this.sock.destroy();
    } catch {
      /* al dicht */
    }
  }
}

async function scram(conn, user, password) {
  const nonce = crypto.randomBytes(18).toString("base64");
  const firstBare = `n=,r=${nonce}`;
  const clientFirst = `n,,${firstBare}`;
  const mech = cstr("SCRAM-SHA-256");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeInt32BE(Buffer.byteLength(clientFirst));
  conn.send("p", Buffer.concat([mech, lenBuf, Buffer.from(clientFirst, "utf8")]));

  let { tag, body } = await conn.msg();
  if (tag === "E") throw new Error(parseErrorResponse(body));
  if (tag !== "R" || body.readUInt32BE(0) !== 11) throw new Error("SCRAM: verwachtte server-first");
  const serverFirst = body.slice(4).toString("utf8");
  const parts = Object.fromEntries(
    serverFirst.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    })
  );
  const salt = Buffer.from(parts.s, "base64");
  const iterations = parseInt(parts.i, 10);
  const salted = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = crypto.createHmac("sha256", salted).update("Client Key").digest();
  const serverKey = crypto.createHmac("sha256", salted).update("Server Key").digest();
  const storedKey = crypto.createHash("sha256").update(clientKey).digest();
  const finalNoProof = `c=biws,r=${parts.r}`;
  const authMsg = `${firstBare},${serverFirst},${finalNoProof}`;
  const sig = crypto.createHmac("sha256", storedKey).update(authMsg).digest();
  const proof = Buffer.alloc(clientKey.length);
  for (let i = 0; i < clientKey.length; i++) proof[i] = clientKey[i] ^ sig[i];
  conn.send("p", Buffer.from(`${finalNoProof},p=${proof.toString("base64")}`, "utf8"));

  ({ tag, body } = await conn.msg());
  if (tag === "E") throw new Error(parseErrorResponse(body));
  if (tag !== "R" || body.readUInt32BE(0) !== 12) throw new Error("SCRAM: verwachtte server-final");
  const expected = crypto.createHmac("sha256", serverKey).update(authMsg).digest().toString("base64");
  // De server-signature controleren is niet optioneel: zonder deze stap
  // accepteert de client een tegenpartij die het wachtwoord niet kent.
  if (body.slice(4).toString("utf8") !== `v=${expected}`) throw new Error("SCRAM: server-signature klopt niet");
}

async function authenticate(conn, { user, password, database }) {
  const params = [cstr("user"), cstr(user), cstr("database"), cstr(database), Buffer.from([0])];
  const body = Buffer.concat([Buffer.alloc(4), ...params]);
  body.writeUInt32BE(196608, 0);
  conn.sock.write(Buffer.concat([(() => { const b = Buffer.alloc(4); b.writeUInt32BE(body.length + 4); return b; })(), body]));

  for (;;) {
    const { tag, body: b } = await conn.msg();
    if (tag === "E") throw new Error(parseErrorResponse(b));
    if (tag === "Z") return;
    if (tag !== "R") continue; // S (param status), K (backend key), N (notice)
    const code = b.readUInt32BE(0);
    if (code === 0 || code === 11 || code === 12) continue;
    if (code === 3) {
      conn.send("p", cstr(password));
    } else if (code === 5) {
      const salt = b.slice(4, 8);
      const inner = crypto.createHash("md5").update(password + user).digest("hex");
      const token = "md5" + crypto.createHash("md5").update(Buffer.concat([Buffer.from(inner), salt])).digest("hex");
      conn.send("p", cstr(token));
    } else if (code === 10) {
      if (!b.slice(4).toString("latin1").includes("SCRAM-SHA-256")) throw new Error("geen SCRAM-SHA-256 aangeboden");
      await scram(conn, user, password);
    } else {
      throw new Error(`niet-ondersteunde auth-code ${code}`);
    }
  }
}

/**
 * Verbindt, voert één of meer read-only queries uit, en sluit altijd af.
 * @param {string[]} sqls
 * @returns {Promise<Array<{cols: string[], rows: string[][]}>>}
 */
export async function pgQuery(sqls, opts = {}) {
  const cfg = {
    host: opts.host ?? process.env.PGHOST,
    port: parseInt(opts.port ?? process.env.PGPORT ?? "5432", 10),
    user: opts.user ?? process.env.PGUSER,
    password: opts.password ?? process.env.PGPASSWORD ?? "",
    database: opts.database ?? process.env.PGDATABASE,
  };
  for (const k of ["host", "user", "database"]) {
    if (!cfg[k]) throw new Error(`PG-config onvolledig: ${k} ontbreekt (verwacht PGHOST/PGUSER/PGDATABASE in de env)`);
  }
  for (const sql of sqls) {
    const head = sql.trim().split(/\s+/, 1)[0].toLowerCase();
    if (head !== "select" && head !== "with") {
      throw new Error(`pgclient is read-only, kreeg ${JSON.stringify(head)}`);
    }
  }

  const sock = await new Promise((resolve, reject) => {
    const s = net.createConnection({ host: cfg.host, port: cfg.port });
    const timer = setTimeout(() => { s.destroy(); reject(new Error(`connect-timeout naar ${cfg.host}:${cfg.port}`)); },
      opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS);
    s.once("connect", () => { clearTimeout(timer); resolve(s); });
    s.once("error", (err) => { clearTimeout(timer); reject(err); });
  });

  const conn = new Conn(sock);
  // Eén klok over de hele sessie. Zonder deze kan een DB die de verbinding
  // accepteert maar niet antwoordt de check-lus van de monitor vasthouden, en
  // dan is de bewaker stil op precies dezelfde manier als de storing die hij
  // moet zien.
  const deadline = setTimeout(() => conn.sock.destroy(new Error("query-timeout")),
    opts.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS);
  try {
    await authenticate(conn, cfg);
    const out = [];
    for (const sql of sqls) {
      conn.send("Q", cstr(sql));
      let cols = [];
      const rows = [];
      let err = null;
      for (;;) {
        const { tag, body } = await conn.msg();
        if (tag === "T") {
          const n = body.readUInt16BE(0);
          cols = [];
          let off = 2;
          for (let i = 0; i < n; i++) {
            const end = body.indexOf(0, off);
            cols.push(body.slice(off, end).toString("utf8"));
            off = end + 1 + 18;
          }
        } else if (tag === "D") {
          const n = body.readUInt16BE(0);
          const row = [];
          let off = 2;
          for (let i = 0; i < n; i++) {
            const len = body.readInt32BE(off);
            off += 4;
            if (len === -1) row.push(null);
            else { row.push(body.slice(off, off + len).toString("utf8")); off += len; }
          }
          rows.push(row);
        } else if (tag === "E") {
          err = parseErrorResponse(body);
        } else if (tag === "Z") {
          break;
        }
      }
      if (err) throw new Error(err);
      out.push({ cols, rows });
    }
    return out;
  } finally {
    clearTimeout(deadline);
    conn.end();
  }
}
