/// <reference types="vite/client" />

// CSS module declarations for TypeScript
declare module '*.css' {
  const css: string;
  export default css;
}
