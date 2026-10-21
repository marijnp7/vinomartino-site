#!/usr/bin/env python3
"""LAT-14174: zet entrypoint/command + een ro bind-mount op één compose-service.
args: <compose-file> <service> <entrypoint-json> <command-json> <mount>
exit 0 = gepatcht of al identiek; 3 = service heeft al een andere entrypoint/command; 4 = service niet gevonden.
Schrijft naar stdout; het bestand zelf schrijft de aanroeper (owner/mode behouden)."""
import json, re, sys

path, svc, ep, cmd, mount = sys.argv[1:6]
ep_line = "    entrypoint: " + json.dumps(json.loads(ep))
cmd_line = "    command: " + json.dumps(json.loads(cmd))
lines = open(path).read().split("\n")
try:
    start = next(i for i, l in enumerate(lines) if re.fullmatch(r"  %s:\s*" % re.escape(svc), l))
except StopIteration:
    sys.exit(4)
end = next((i for i in range(start + 1, len(lines)) if re.match(r"  [^ #]", lines[i])), len(lines))
block = lines[start + 1:end]
have = [l for l in block if re.match(r"    (entrypoint|command):", l)]
if have and sorted(have) != sorted([ep_line, cmd_line]):
    print("\n".join(have), file=sys.stderr)
    sys.exit(3)
if not have:
    block = [ep_line, cmd_line] + block
if not any(mount in l for l in block):
    vi = next((i for i, l in enumerate(block) if re.fullmatch(r"    volumes:\s*", l)), None)
    if vi is None:
        block = block[:2] + ["    volumes:", "      - " + mount] + block[2:]
    else:
        nxt = next((block[j] for j in range(vi + 1, len(block)) if block[j].strip() and not block[j].lstrip().startswith("#")), "      - x")
        indent = re.match(r"(\s*)", nxt).group(1) or "      "
        block = block[:vi + 1] + [indent + "- " + mount] + block[vi + 1:]
sys.stdout.write("\n".join(lines[:start + 1] + block + lines[end:]))
