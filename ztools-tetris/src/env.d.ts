/// <reference types="vite/client" />
/// <reference types="@ztools-center/ztools-api-types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

/** Preload 桥接暴露的最小本地能力（对应 public/preload/services.js） */
interface TetrisServices {
  saveSnapshot: (base64Url: string) => string | null
}

declare global {
  interface Window {
    tetrisServices?: TetrisServices
  }
}

export {}
