import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const artifact = path.dirname(fileURLToPath(import.meta.url));
const versions = process.argv[2] ? [process.argv[2]] : ["baseline", "candidate"];
for (const version of versions) {
  const server = spawn(process.execPath, ["--import", "tsx", path.join(artifact, "probe.mjs"), version, "serve", "0"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exit = once(server, "exit");
  const output = readline.createInterface({ input: server.stdout });
  try {
    const [line] = await Promise.race([
      once(output, "line"),
      exit.then(([code]) => { throw new Error("Fixture server exited " + code); }),
    ]);
    const { endpoint } = JSON.parse(line);
    console.log(version, endpoint);
    execFileSync(process.execPath, [path.join(artifact, "evidence.mjs"), version, endpoint, process.argv[3] ?? "both"], {
      stdio: "inherit", timeout: 220000,
    });
  } finally {
    output.close();
    server.kill();
    await exit;
  }
}
