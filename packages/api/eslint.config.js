// eslint.config.js — flat config equivalent of the provided .eslintrc.json
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import sonarjs from "eslint-plugin-sonarjs";
import js from "@eslint/js";

// Bun runtime + Web API globals available in every source file
const bunGlobals = {
  // Bun-specific
  Bun: "readonly",
  // Node globals available in Bun
  process: "readonly",
  Buffer: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  // Web API globals (Bun supports these natively)
  fetch: "readonly",
  Request: "readonly",
  Response: "readonly",
  Headers: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  FormData: "readonly",
  Blob: "readonly",
  File: "readonly",
  ReadableStream: "readonly",
  WritableStream: "readonly",
  crypto: "readonly",
  WebSocket: "readonly",
  // Bun Web Crypto + Encoding globals
  CryptoKey: "readonly",
  SubtleCrypto: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  Uint8Array: "readonly",
  ArrayBuffer: "readonly",
  // Promise/collection globals
  Promise: "readonly",
  Map: "readonly",
  Set: "readonly",
  WeakMap: "readonly",
};

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    ignores: ["example/**/*", "test/**/*"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      sonarjs,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: bunGlobals,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      ...sonarjs.configs.recommended.rules,
      // Overrides from user config
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-mixed-spaces-and-tabs": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-extra-semi": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-namespace": "off",
      "no-case-declarations": "off",
      "no-extra-semi": "off",
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-all-duplicated-branches": "off",
      "sonarjs/slow-regex": "off",
      // Allow patterns common in Elysia handlers
      "sonarjs/no-nested-assignment": "off",
    },
  },
];
