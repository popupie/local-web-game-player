// @ts-nocheck

export function createProcessRuntime(options = {}) {
  let currentWorkingDirectory = options.cwd || "/www";
  function processNextTick(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("process.nextTick callback must be a function.");
    }
    const args = Array.prototype.slice.call(arguments, 1);
    const run = () => callback.apply(null, args);
    if (typeof queueMicrotask === "function") {
      queueMicrotask(run);
    } else {
      Promise.resolve().then(run);
    }
  }

  function processUptime() {
    return typeof performance !== "undefined" ? performance.now() / 1000 : 0;
  }

  function processHrtime(previous) {
    const nanoseconds = Math.floor(processUptime() * 1e9);
    let seconds = Math.floor(nanoseconds / 1e9);
    let remainder = nanoseconds - seconds * 1e9;
    if (previous !== undefined) {
      if (
        !Array.isArray(previous) ||
        previous.length !== 2 ||
        !Number.isFinite(previous[0]) ||
        !Number.isFinite(previous[1])
      ) {
        throw new TypeError("process.hrtime previous value must be a [seconds, nanoseconds] tuple.");
      }
      seconds -= previous[0];
      remainder -= previous[1];
      if (remainder < 0) {
        seconds -= 1;
        remainder += 1e9;
      }
    }
    return [seconds, remainder];
  }

  function unsupportedProcessOperation(name) {
    return function unsupported() {
      throw new Error("Local Web Game Player cannot provide process." + name + "().");
    };
  }

  function setProcessDefault(target, key, value) {
    if (target[key] !== undefined) return;
    setProcessValue(target, key, value);
  }

  function setProcessValue(target, key, value) {
    try {
      target[key] = value;
    } catch {
      try {
        Object.defineProperty(target, key, {
          configurable: true,
          value,
          writable: true,
        });
      } catch {
        // A host-defined process object may have non-configurable properties.
      }
    }
  }

  function installProcessCompatibility() {
    const processObject =
      window.process && typeof window.process === "object" ? window.process : {};
    const noopProcessEvent = () => processObject;

    setProcessDefault(processObject, "title", "browser");
    setProcessDefault(processObject, "browser", true);
    if (options.platform) {
      setProcessValue(processObject, "platform", options.platform);
    } else {
      setProcessDefault(processObject, "platform", "browser");
    }
    if (options.arch) {
      setProcessValue(processObject, "arch", options.arch);
    } else {
      setProcessDefault(processObject, "arch", "x64");
    }
    setProcessDefault(processObject, "env", {});
    setProcessDefault(processObject, "argv", ["/Game.exe"]);
    setProcessDefault(processObject, "execArgv", []);
    setProcessDefault(processObject, "version", "v16.20.2");
    const versions =
      processObject.versions && typeof processObject.versions === "object"
        ? processObject.versions
        : {};
    setProcessDefault(versions, "node", "16.20.2");
    setProcessDefault(versions, "nw", "0.72.0");
    setProcessDefault(versions, "node-webkit", versions.nw);
    setProcessValue(processObject, "versions", versions);
    setProcessDefault(processObject, "execPath", "/Game.exe");
    setProcessDefault(processObject, "mainModule", {
      filename: "/www/index.html",
    });
    setProcessDefault(processObject, "cwd", () => currentWorkingDirectory);
    setProcessDefault(processObject, "nextTick", processNextTick);
    setProcessDefault(processObject, "uptime", processUptime);
    setProcessDefault(processObject, "hrtime", processHrtime);
    setProcessDefault(processObject, "umask", () => 0);
    setProcessDefault(processObject, "on", noopProcessEvent);
    setProcessDefault(processObject, "addListener", noopProcessEvent);
    setProcessDefault(processObject, "once", noopProcessEvent);
    setProcessDefault(processObject, "off", noopProcessEvent);
    setProcessDefault(processObject, "removeListener", noopProcessEvent);
    setProcessDefault(processObject, "removeAllListeners", noopProcessEvent);
    setProcessDefault(processObject, "emit", () => false);
    setProcessDefault(processObject, "exit", () => undefined);
    setProcessDefault(processObject, "kill", () => false);
    setProcessDefault(processObject, "getuid", () => -1);
    setProcessDefault(processObject, "getgid", () => -1);
    setProcessDefault(processObject, "chdir", (directory) => {
      const value = String(directory ?? "").replace(/\\+/g, "/");
      if (!value) throw new TypeError("directory must not be empty.");
      currentWorkingDirectory = value.startsWith("/")
        ? value
        : currentWorkingDirectory.replace(/\/+$/, "") + "/" + value;
    });
    setProcessDefault(processObject, "binding", unsupportedProcessOperation("binding"));
    setProcessDefault(processObject, "memoryUsage", () => ({
      arrayBuffers: 0,
      external: 0,
      heapTotal: 0,
      heapUsed: 0,
      rss: 0,
    }));
    setProcessDefault(processObject, "cpuUsage", () => ({ system: 0, user: 0 }));
    setProcessDefault(processObject, "emitWarning", (warning) => console.warn(warning));

    if (typeof processObject.cwd !== "function") {
      setProcessValue(processObject, "cwd", () => "/www");
    }
    if (
      !processObject.mainModule ||
      typeof processObject.mainModule !== "object" ||
      typeof processObject.mainModule.filename !== "string"
    ) {
      setProcessValue(processObject, "mainModule", { filename: "/www/index.html" });
    }
    if (typeof processObject.execPath !== "string") {
      setProcessValue(processObject, "execPath", "/Game.exe");
    }

    if (window.process !== processObject) {
      setProcessValue(window, "process", processObject);
    }
    return processObject;
  }


  return installProcessCompatibility();
}
