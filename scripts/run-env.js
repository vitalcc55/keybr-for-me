import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const environment = {};
while (args.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0])) {
  const [name, ...valueParts] = args.shift().split("=");
  environment[name] = valueParts.join("=");
}

const [command, ...commandArgs] = args;
if (command == null) {
  console.error("Usage: node scripts/run-env.js NAME=value command [args...]");
  process.exit(2);
}

const executable =
  command === "node"
    ? process.execPath
    : process.platform === "win32" && !/[\\/.]/.test(command)
      ? `${command}.cmd`
      : command;
const result = spawnSync(executable, commandArgs, {
  env: { ...process.env, ...environment },
  shell: process.platform === "win32" && executable.endsWith(".cmd"),
  stdio: "inherit",
});

if (result.error != null) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(
  result.status ??
    (result.signal === "SIGINT" ? 130 : result.signal === "SIGTERM" ? 143 : 1),
);
