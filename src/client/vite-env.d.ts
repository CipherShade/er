/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CENTER_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}