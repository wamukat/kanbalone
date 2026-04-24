import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const COMPOSE_FILE = "docker-compose.remote-providers.yml";
const REDMINE_CONTAINER = "kanbalone-redmine";
const GITLAB_CONTAINER = "kanbalone-gitlab";
const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL ?? "http://localhost:38080";
const GITLAB_BASE_URL = process.env.GITLAB_BASE_URL ?? "http://localhost:38929";
const GITLAB_ROOT_PASSWORD = process.env.GITLAB_ROOT_PASSWORD ?? "S9v!q2Lx#5rT8mN4pW7";
const REDMINE_PROJECT_IDENTIFIER = process.env.REDMINE_PROJECT_IDENTIFIER ?? "kanbalone-sandbox";
const REDMINE_ISSUE_SUBJECT = process.env.REDMINE_ISSUE_SUBJECT ?? "Redmine remote issue for Kanbalone";
const REDMINE_ISSUE_BODY = process.env.REDMINE_ISSUE_BODY ?? "Initial Redmine body from docker sandbox";
const GITLAB_PROJECT_PATH = process.env.GITLAB_PROJECT_PATH ?? "kanbalone-sandbox";
const GITLAB_PROJECT_NAME = process.env.GITLAB_PROJECT_NAME ?? "kanbalone-sandbox";
const GITLAB_ISSUE_TITLE = process.env.GITLAB_ISSUE_TITLE ?? "GitLab remote issue for Kanbalone";
const GITLAB_ISSUE_BODY = process.env.GITLAB_ISSUE_BODY ?? "Initial GitLab body from docker sandbox";
const WAIT_TIMEOUT_MS = Number(process.env.REMOTE_PROVIDER_BOOTSTRAP_TIMEOUT_MS ?? "900000");
const ENV_LOCAL_FILE = process.env.REMOTE_PROVIDER_ENV_FILE ?? ".env.local";

async function main() {
  await composeUp();

  await waitForHttpOk(`${REDMINE_BASE_URL}/`, "Redmine");
  await waitForHttpOk(`${GITLAB_BASE_URL}/users/sign_in`, "GitLab sign-in");

  const redmine = await bootstrapRedmine();
  const gitlab = await bootstrapGitlab();

  const result = {
    redmine,
    gitlab,
    kanbaloneRemoteCredentials: {
      [`redmine:${redmine.instanceUrl}`]: redmine.apiKey,
      [`gitlab:${gitlab.instanceUrl}`]: gitlab.token,
    },
  };

  await writeEnvLocal(result);

  console.log(JSON.stringify(result, null, 2));
  console.log("");
  console.log("KANBALONE_REMOTE_CREDENTIALS=");
  console.log(JSON.stringify(result.kanbaloneRemoteCredentials));
  console.log("");
  console.log(`Wrote ${ENV_LOCAL_FILE}`);
}

async function composeUp() {
  await exec("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"]);
}

async function bootstrapRedmine() {
  await redmineRailsRunner("Setting.rest_api_enabled = 1");
  const trackerCount = Number(await redmineRailsRunner("puts Tracker.count"));
  if (trackerCount === 0) {
    await execInContainer(REDMINE_CONTAINER, [
      "bash",
      "-lc",
      "REDMINE_LANG=en bundle exec rake redmine:load_default_data",
    ]);
  }

  const adminApiKey = await redmineRailsRunner(`
    user = User.find_by_login("admin")
    if user.api_key.to_s.empty?
      user.api_key = Token.create!(user: user, action: "api", value: Token.generate_token_value).value
      user.save!
      user.reload
    end
    puts user.api_key
  `);

  const projectJson = await redmineRailsRunnerJson(`
    project = Project.find_or_initialize_by(identifier: ${rubyString(REDMINE_PROJECT_IDENTIFIER)})
    project.name = "Kanbalone Sandbox" if project.name.to_s.empty?
    project.is_public = true
    project.enabled_module_names = ["issue_tracking"]
    project.tracker_ids = Tracker.pluck(:id)
    project.save! if project.new_record? || project.changed?

    issue = Issue.where(project: project, subject: ${rubyString(REDMINE_ISSUE_SUBJECT)}).first_or_initialize
    issue.author ||= User.find_by_login("admin")
    issue.subject = ${rubyString(REDMINE_ISSUE_SUBJECT)}
    issue.description = ${rubyString(REDMINE_ISSUE_BODY)}
    issue.tracker ||= Tracker.first
    issue.status ||= IssueStatus.first
    issue.priority ||= IssuePriority.default || IssuePriority.first
    issue.save! if issue.new_record? || issue.changed?

    puts({
      project_id: project.id,
      project_identifier: project.identifier,
      project_name: project.name,
      issue_id: issue.id,
      issue_url: ${rubyString(REDMINE_BASE_URL)} + "/issues/" + issue.id.to_s
    }.to_json)
  `);

  return {
    provider: "redmine",
    instanceUrl: REDMINE_BASE_URL,
    apiKey: adminApiKey.trim(),
    projectId: String(projectJson.project_id),
    projectIdentifier: projectJson.project_identifier,
    projectName: projectJson.project_name,
    issueId: String(projectJson.issue_id),
    issueUrl: projectJson.issue_url,
  };
}

async function bootstrapGitlab() {
  const cookies = new Map();
  const signInPage = await fetchWithCookies(`${GITLAB_BASE_URL}/users/sign_in`, { cookies });
  const csrfToken = extractMetaCsrfToken(signInPage.body);
  await fetchWithCookies(`${GITLAB_BASE_URL}/users/sign_in`, {
    method: "POST",
    cookies,
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams({
      authenticity_token: csrfToken,
      "user[login]": "root",
      "user[password]": GITLAB_ROOT_PASSWORD,
      "user[remember_me]": "0",
    }),
    redirect: "manual",
    acceptedStatuses: [302],
  });

  const tokenPage = await fetchWithCookies(`${GITLAB_BASE_URL}/-/user_settings/personal_access_tokens`, { cookies });
  const patCsrfToken = extractMetaCsrfToken(tokenPage.body);
  const personalAccessToken = `kanbalone-sandbox-${Date.now()}`;
  const createTokenResponse = await fetchWithCookies(`${GITLAB_BASE_URL}/-/user_settings/personal_access_tokens`, {
    method: "POST",
    cookies,
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-csrf-token": patCsrfToken,
      "x-requested-with": "XMLHttpRequest",
    },
    body: new URLSearchParams({
      "personal_access_token[name]": personalAccessToken,
      "personal_access_token[expires_at]": oneYearFromNowDate(),
      "personal_access_token[scopes][]": "api",
    }),
  });
  const tokenPayload = JSON.parse(createTokenResponse.body);
  const token = tokenPayload.token;
  if (!token) {
    throw new Error("GitLab bootstrap failed to create a personal access token");
  }

  const existingProject = await gitlabApi(token, `/projects/${encodeURIComponent(`root/${GITLAB_PROJECT_PATH}`)}`, {
    optional: true,
  });
  const project = existingProject ?? (await gitlabApi(token, "/projects", {
    method: "POST",
    body: JSON.stringify({
      name: GITLAB_PROJECT_NAME,
      path: GITLAB_PROJECT_PATH,
      visibility: "public",
      initialize_with_readme: true,
    }),
  }));

  const issues = await gitlabApi(token, `/projects/${project.id}/issues?per_page=100`);
  const existingIssue = issues.find((issue) => issue.title === GITLAB_ISSUE_TITLE);
  const issue = existingIssue ?? (await gitlabApi(token, `/projects/${project.id}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: GITLAB_ISSUE_TITLE,
      description: GITLAB_ISSUE_BODY,
    }),
  }));

  return {
    provider: "gitlab",
    instanceUrl: GITLAB_BASE_URL,
    token,
    projectId: String(project.id),
    projectPath: project.path_with_namespace,
    issueId: String(issue.iid),
    issueUrl: `${GITLAB_BASE_URL}/${project.path_with_namespace}/-/issues/${issue.iid}`,
    apiIssueUrl: issue.web_url,
  };
}

async function gitlabApi(token, path, options = {}) {
  const response = await fetch(`${GITLAB_BASE_URL}/api/v4${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "private-token": token,
      ...(options.headers ?? {}),
    },
    body: options.body,
  });
  if (options.optional && response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GitLab API ${options.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function waitForHttpOk(url, label) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(5000);
  }
  throw new Error(`${label} did not become ready within ${WAIT_TIMEOUT_MS}ms`);
}

async function fetchWithCookies(url, options = {}) {
  const headers = new Headers(options.headers);
  if (options.cookies?.size) {
    headers.set("cookie", serializeCookies(options.cookies));
  }
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
    redirect: options.redirect ?? "follow",
  });
  updateCookies(options.cookies, response.headers);
  const body = await response.text();
  const acceptedStatuses = new Set(options.acceptedStatuses ?? []);
  if (!response.ok && !acceptedStatuses.has(response.status)) {
    throw new Error(`HTTP ${response.status} for ${options.method ?? "GET"} ${url}: ${body.slice(0, 500)}`);
  }
  return { body, headers: response.headers, status: response.status };
}

function extractMetaCsrfToken(html) {
  const match = html.match(/<meta name="csrf-token" content="([^"]+)"/);
  if (!match?.[1]) {
    throw new Error("Could not extract CSRF token from GitLab page");
  }
  return match[1];
}

function updateCookies(cookies, headers) {
  if (!cookies) {
    return;
  }
  const setCookieHeader = headers.get("set-cookie");
  if (!setCookieHeader) {
    return;
  }
  for (const cookie of splitSetCookieHeader(setCookieHeader)) {
    const [nameValue] = cookie.split(";", 1);
    const separatorIndex = nameValue.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = nameValue.slice(0, separatorIndex).trim();
    const value = nameValue.slice(separatorIndex + 1).trim();
    cookies.set(name, value);
  }
}

function splitSetCookieHeader(header) {
  const result = [];
  let current = "";
  let inExpires = false;
  for (let index = 0; index < header.length; index += 1) {
    const char = header[index];
    if (header.slice(index, index + 8).toLowerCase() === "expires=") {
      inExpires = true;
    }
    if (char === "," && !inExpires) {
      result.push(current);
      current = "";
      continue;
    }
    if (inExpires && char === ";") {
      inExpires = false;
    }
    current += char;
  }
  if (current) {
    result.push(current);
  }
  return result;
}

function serializeCookies(cookies) {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function redmineRailsRunner(code) {
  const output = await execInContainer(REDMINE_CONTAINER, [
    "bash",
    "-lc",
    `bundle exec rails runner ${shellQuote(code)}`,
  ]);
  return extractLastNonEmptyLine(output);
}

async function redmineRailsRunnerJson(code) {
  return JSON.parse(await redmineRailsRunner(code));
}

async function execInContainer(container, args) {
  const { stdout } = await exec("docker", ["exec", container, ...args]);
  return stdout.trim();
}

async function exec(command, args) {
  return execFileAsync(command, args, {
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function rubyString(value) {
  return JSON.stringify(value);
}

function oneYearFromNowDate() {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function extractLastNonEmptyLine(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "";
}

async function writeEnvLocal(result) {
  const nextEntries = new Map([
    ["KANBALONE_REMOTE_CREDENTIALS", JSON.stringify(result.kanbaloneRemoteCredentials)],
    ["KANBALONE_REMOTE_REDMINE_ISSUE_URL", result.redmine.issueUrl],
    ["KANBALONE_REMOTE_GITLAB_ISSUE_URL", result.gitlab.issueUrl],
    ["KANBALONE_REMOTE_GITLAB_API_ISSUE_URL", result.gitlab.apiIssueUrl],
  ]);

  let existing = "";
  try {
    existing = await readFile(ENV_LOCAL_FILE, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set();
  const updated = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) {
      return line;
    }
    const key = match[1];
    if (!nextEntries.has(key)) {
      return line;
    }
    seen.add(key);
    return `${key}=${shellEnvValue(nextEntries.get(key) ?? "")}`;
  });

  for (const [key, value] of nextEntries) {
    if (!seen.has(key)) {
      updated.push(`${key}=${shellEnvValue(value)}`);
    }
  }

  const serialized = `${updated.filter((line, index, array) => line !== "" || index < array.length - 1).join("\n")}\n`;
  await writeFile(ENV_LOCAL_FILE, serialized, "utf8");
}

function shellEnvValue(value) {
  return JSON.stringify(String(value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
