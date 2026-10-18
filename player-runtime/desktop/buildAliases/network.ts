// @ts-nocheck

import { EventEmitter } from "events";

function requestUrl(input, options, secure = false) {
  if (typeof input === "string" || input instanceof URL) return String(input);
  const value = input || options || {};
  const protocol = value.protocol || (secure ? "https:" : "http:");
  const hostname = value.hostname || value.host || "localhost";
  const port = value.port ? ":" + value.port : "";
  return protocol + "//" + hostname + port + (value.path || value.pathname || "/");
}

class IncomingMessage extends EventEmitter {
  constructor(response) {
    super();
    this.headers = Object.fromEntries(response.headers.entries());
    this.rawHeaders = Array.from(response.headers.entries()).flat();
    this.statusCode = response.status;
    this.statusMessage = response.statusText;
    this.url = response.url;
  }
  setEncoding() {
    return this;
  }
}

class ClientRequest extends EventEmitter {
  constructor(input, options, callback, secure = false) {
    super();
    this.input = input;
    this.options = typeof input === "object" && !(input instanceof URL)
      ? { ...input }
      : { ...(options || {}) };
    this.secure = secure;
    this.headers = { ...(this.options.headers || {}) };
    this.body = [];
    this.aborted = false;
    if (typeof callback === "function") this.once("response", callback);
  }
  abort() {
    this.aborted = true;
    return this;
  }
  destroy(error) {
    this.aborted = true;
    if (error) queueMicrotask(() => this.emit("error", error));
    return this;
  }
  end(chunk, encoding, callback) {
    if (typeof encoding === "function") callback = encoding;
    if (chunk !== undefined && chunk !== null) this.write(chunk);
    if (typeof callback === "function") this.once("finish", callback);
    this.emit("finish");
    if (!this.aborted) void this.perform();
    return this;
  }
  getHeader(name) {
    const key = Object.keys(this.headers).find(
      (candidate) => candidate.toLowerCase() === String(name).toLowerCase(),
    );
    return key ? this.headers[key] : undefined;
  }
  removeHeader(name) {
    const key = Object.keys(this.headers).find(
      (candidate) => candidate.toLowerCase() === String(name).toLowerCase(),
    );
    if (key) delete this.headers[key];
  }
  setHeader(name, value) {
    this.headers[name] = value;
    return this;
  }
  setNoDelay() {
    return this;
  }
  setSocketKeepAlive() {
    return this;
  }
  setTimeout(_timeout, callback) {
    if (typeof callback === "function") this.once("timeout", callback);
    return this;
  }
  write(chunk) {
    this.body.push(chunk);
    return true;
  }
  async perform() {
    try {
      const method = this.options.method || "GET";
      const body = /^(?:GET|HEAD)$/iu.test(method)
        ? undefined
        : this.body.map((part) => String(part)).join("");
      const response = await fetch(requestUrl(this.input, this.options, this.secure), {
        body,
        headers: this.headers,
        method,
      });
      if (this.aborted) return;
      const message = new IncomingMessage(response);
      this.emit("response", message);
      const text = await response.text();
      if (text) message.emit("data", text);
      message.emit("end");
    } catch (error) {
      if (!this.aborted) this.emit("error", error);
    }
  }
}

export class Agent extends EventEmitter {
  addRequest(request) {
    queueMicrotask(() => request.emit("error", new Error("TCP agents are unavailable in the browser runtime.")));
  }
  destroy() {}
}

export class Socket extends EventEmitter {
  constructor() {
    super();
    this.readable = true;
    this.writable = true;
  }
  connect() {
    queueMicrotask(() => this.emit("error", new Error("Raw TCP sockets are unavailable in the browser runtime.")));
    return this;
  }
  destroy() {
    return this;
  }
  end() {
    return this;
  }
  setEncoding() {
    return this;
  }
  write() {
    return false;
  }
}

export const globalAgent = new Agent();
export function request(input, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = undefined;
  }
  return new ClientRequest(input, options, callback, false);
}
export function get(input, options, callback) {
  const result = request(input, options, callback);
  result.end();
  return result;
}
export function connect() {
  return new Socket().connect(...arguments);
}
export const createConnection = connect;
export const isIP = (value) => (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(String(value)) ? 4 : String(value).includes(":") ? 6 : 0);
export const isIPv4 = (value) => isIP(value) === 4;
export const isIPv6 = (value) => isIP(value) === 6;

export default {
  Agent,
  ClientRequest,
  IncomingMessage,
  Socket,
  connect,
  createConnection,
  get,
  globalAgent,
  isIP,
  isIPv4,
  isIPv6,
  request,
};
