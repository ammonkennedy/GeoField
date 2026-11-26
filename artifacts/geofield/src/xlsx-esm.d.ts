// Explicit ESM entry exposes CFB consistently in native ESM tests and Vite.
declare module 'xlsx/xlsx.mjs' {
  export * from 'xlsx';
}
