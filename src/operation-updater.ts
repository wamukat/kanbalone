import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyInstance } from "fastify";

import policy from "../public/operation-updater-policy.json" with { type: "json" };
import { getBodyRecord } from "./route-helpers.js";

const operationUpdater = new AsyncLocalStorage<string>();
const routes: Readonly<Record<string, readonly string[]>> = policy.routes;
const invalidCharacters = new RegExp(policy.invalidCharacters, "u");
const invalidUpdater = `Enter an updater of 1 to ${policy.maxLength} valid Unicode characters, with at least one non-whitespace character and no control characters.`;

export function currentOperationUpdater(): string | null {
  return operationUpdater.getStore() ?? null;
}

export function requireValidUpdater(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > policy.maxLength || invalidCharacters.test(value)) {
    throw Object.assign(new Error(invalidUpdater), { statusCode: 400 });
  }
  return value;
}

export function registerOperationUpdater(app: FastifyInstance): void {
  app.addHook("preValidation", (request, _reply, done) => {
    const route = request.routeOptions.url;
    if (route === undefined || !routes[route]?.includes(request.method)) {
      done();
      return;
    }
    const body = getBodyRecord(request.body);
    let updater = "API";
    if (Object.hasOwn(body, "updater")) {
      updater = requireValidUpdater(body.updater);
      // Validate the underlying mutation with its original schema, including property counts.
      delete body.updater;
    }
    operationUpdater.run(updater, done);
  });
}
