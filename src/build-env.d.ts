interface ImportMetaEnv {
  readonly VITE_RESEARCH_ROLE_DEV_ENABLED?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_QA_MODE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
