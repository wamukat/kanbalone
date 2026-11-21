import { verifyRelease } from "./release-common.mjs";
const result = verifyRelease({ version: process.env.RELEASE_VERSION, sha: process.env.RELEASE_SHA });
console.log(JSON.stringify({ version: result.version, sha: result.sha, prerelease: result.prerelease }));
