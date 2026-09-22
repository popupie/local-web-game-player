// @ts-nocheck

export function createProcessRuntime(options = {}) {
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
    setProcessDefault(processObject, "argv", []);
    setProcessDefault(processObject, "version", "");
    setProcessDefault(processObject, "versions", {});
    setProcessDefault(processObject, "execPath", "/Game.exe");
    setProcessDefault(processObject, "mainModule", {
      filename: "/www/index.html",
    });
    setProcessDefault(processObject, "cwd", () => "/www");
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
    setProcessDefault(processObject, "chdir", unsupportedProcessOperation("chdir"));
    setProcessDefault(processObject, "binding", unsupportedProcessOperation("binding"));

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
