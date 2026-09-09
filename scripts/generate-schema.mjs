/**
 * Regenerate `src/types/openapi.yml` from the backend.
 *
 * A script rather than an inline npm command because the interpreter is not
 * the same string on every machine: Windows has `.venv/Scripts/python.exe`,
 * everywhere else `.venv/bin/python`, and a contributor may have neither and be
 * running the backend from an activated shell. Encoding one of those in
 * `package.json` makes the command silently non-portable.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = resolve(root, "..", "OMS-Backend");
const out = join(root, "src", "types", "openapi.yml");

if (!existsSync(join(backend, "manage.py"))) {
  console.error(
    `No Django project at ${backend}.\n` +
      "This expects OMS-Backend beside OMS-Frontend. Generate the schema there\n" +
      "with `manage.py spectacular --file <path>` and copy it to src/types/openapi.yml.",
  );
  process.exit(1);
}

const candidates = [
  join(backend, ".venv", "Scripts", "python.exe"),
  join(backend, ".venv", "bin", "python"),
  join(backend, "venv", "Scripts", "python.exe"),
  join(backend, "venv", "bin", "python"),
];
const python = candidates.find((p) => existsSync(p)) ?? "python";

const result = spawnSync(python, ["manage.py", "spectacular", "--file", out], {
  cwd: backend,
  stdio: ["ignore", "inherit", "pipe"],
  encoding: "utf8",
});

if (result.status !== 0) {
  console.error(result.stderr ?? "");
  process.exit(result.status ?? 1);
}

// `spectacular` writes its warnings to stderr and still succeeds. 229 of this
// backend's endpoints are function-based views with no serializer_class, so
// "unable to guess serializer" is the expected steady state, not a regression
// — see src/types/api.ts. Only the count is worth surfacing.
const summary = /^Errors:\s+(\d+)/m.exec(result.stderr ?? "");
console.log(
  `Schema written to ${out}` +
    (summary ? ` (${summary[1]} endpoints could not be typed).` : "."),
);
