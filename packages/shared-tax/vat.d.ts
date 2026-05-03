// Type-only subpath shim so consumers using classic `node` moduleResolution
// pick up the same .d.ts as the modern `exports`-aware resolvers.
export * from "./dist/vat";
export { default } from "./dist/vat";
