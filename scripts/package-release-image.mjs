import { mkdir, writeFile, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { imageOptionsFromEnvironment, smokeImage, runCommand } from "./smoke-image.mjs";

export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function packageReleaseImage(options, directory = "release-artifact", dependencies = {}) {
  const run = dependencies.run ?? runCommand;
  const smoke = dependencies.smoke ?? smokeImage;
  const output = path.resolve(directory);
  await mkdir(output, { recursive: true });
  // A failed smoke or save must never leave a manifest that looks ready to publish.
  await rm(path.join(output, "manifest.json"), { force: true });
  const report = await smoke(options, dependencies);
  const file = path.join(output, "image.tar");
  await run("docker", ["save", "--output", file, report.imageId]);
  const manifest = {
    schemaVersion: 1,
    version: options.version,
    sha: options.sha,
    imageId: report.imageId,
    image: options.image,
    imageFile: "image.tar",
    imageSha256: await sha256File(file),
    platform: "linux/amd64",
    verifiedAt: new Date().toISOString(),
    smoke: { persistenceVerified: report.persistenceVerified },
  };
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = imageOptionsFromEnvironment();
  if (process.argv[2]) options.image = process.argv[2];
  packageReleaseImage(options, process.env.RELEASE_ARTIFACT_DIR || "release-artifact").then((manifest) => console.log(JSON.stringify(manifest, null, 2))).catch((error) => {
    console.error(error); process.exitCode = 1;
  });
}
