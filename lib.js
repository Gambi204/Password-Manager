"use strict";

let encoder = new TextEncoder();
let decoder = new TextDecoder();

// Convert a string to a Uint8Array
export const stringToByteArray = function (str) {
  return encoder.encode(str);
};

// Convert a Uint8Array to a string
export const byteArrayToString = function (arr) {
  return decoder.decode(arr);
};

// Generate a random salt as a Uint8Array
export const genRandomSalt = function (len = 16) {
  const randomBytes = new Uint8Array(len);

  if (typeof window !== "undefined" && window.crypto) {
    // Use browser's crypto API
    window.crypto.getRandomValues(randomBytes);
  } else if (typeof globalThis !== "undefined" && globalThis.crypto) {
    // Use Node.js global crypto (experimental global)
    globalThis.crypto.getRandomValues(randomBytes);
  } else {
    // Use Node.js crypto module synchronously
    const { randomFillSync } = require("crypto");
    randomFillSync(randomBytes);
  }

  return randomBytes;
};

// Convert an untyped array (Array) to a Uint8Array
export const untypedToTypedArray = function (arr) {
  return new Uint8Array(arr);
};

// Convert a Uint8Array to an untyped array (Array)
export const bufferToUntypedArray = function (arr) {
  return Array.from(new Uint8Array(arr));
};
