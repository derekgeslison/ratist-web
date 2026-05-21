/**
 * Ambient type declarations for the Ezoic Standalone SDK that we load
 * via <Script> in app/layout.tsx. Mirrors the surface area documented
 * in Ezoic's Next.js integration guide:
 *   https://docs.ezoic.com/docs/ezoicadsadvanced/nextjs/
 *
 * The cmd queue exists so we can safely push initialization closures
 * before the standalone library has finished loading — Ezoic drains the
 * queue when ready.
 */
declare global {
  interface Window {
    ezstandalone?: {
      cmd: Array<() => void>;
      showAds: (...ids: number[]) => void;
      destroyPlaceholders: (...ids: number[]) => void;
    };
  }
}

export {};
