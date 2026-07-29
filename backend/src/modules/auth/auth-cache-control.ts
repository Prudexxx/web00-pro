import type { RequestHandler, Response } from "express";

export interface AuthNoStoreOptions {
  pragma?: boolean;
}

export function setAuthNoStoreHeaders(
  response: Pick<Response, "set">,
  options: AuthNoStoreOptions = {}
): void {
  response.set("Cache-Control", "no-store");

  if (options.pragma) {
    response.set("Pragma", "no-cache");
  }
}

export function authNoStore(options: AuthNoStoreOptions = {}): RequestHandler {
  return (_request, response, next) => {
    setAuthNoStoreHeaders(response, options);
    next();
  };
}
