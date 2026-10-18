// @ts-nocheck

function runtimeQuerystring() {
  return globalThis.MzPlayerDesktop?.require?.("querystring");
}

export const parse = (...args) => runtimeQuerystring().parse(...args);
export const stringify = (...args) => runtimeQuerystring().stringify(...args);
export const decode = parse;
export const encode = stringify;
export const escape = (value) => encodeURIComponent(String(value));
export const unescape = (value) => decodeURIComponent(String(value));

export default { decode, encode, escape, parse, stringify, unescape };
