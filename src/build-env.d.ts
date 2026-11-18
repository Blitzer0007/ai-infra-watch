interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_QA_MODE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
