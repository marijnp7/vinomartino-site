#!/bin/sh
# LAT-14174 — idempotent herstel van de LAT-12882-patch in /app (wist bij elke container-recreate).
# exit 0 = patch aanwezig (of zojuist toegepast: restart nodig, zie stdout); 2 = anker niet gevonden
# (upstream code gewijzigd: patch handmatig herzien, NIET forceren). Activeert pas na server-restart.
F=/app/packages/adapter-utils/src/acpx-engine/execute.ts
if grep -q LAT-12882 "$F"; then echo "present"; exit 0; fi
python3 - "$F" <<'PY' || exit 2
import sys
p=sys.argv[1]; s=open(p).read()
old="          save: (record) => persistedRuntimeStore.save(record),\n        };\n        const runtimeOptions"
if s.count(old)!=1: sys.exit(2)
new='''          // Never persist the resolved env: `load` re-injects this run's env, so
          // a stored copy is unused and would put every secret_ref in plain
          // text on the shared volume (LAT-12882).
          save: (record) => {
            const sessionOptions = record.acpx?.session_options;
            if (!sessionOptions || !("env" in sessionOptions)) {
              return persistedRuntimeStore.save(record);
            }
            const { env: _env, ...persistedSessionOptions } = sessionOptions;
            return persistedRuntimeStore.save({
              ...record,
              acpx: { ...record.acpx, session_options: persistedSessionOptions },
            });
          },
        };
        const runtimeOptions'''
open(p,'w').write(s.replace(old,new))
PY
echo "applied — server-restart nodig"; exit 0
