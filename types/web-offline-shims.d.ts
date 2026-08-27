declare module "react" {
  // Offline-only shim: the real workspace typecheck uses @types/react.
  export type ReactNode = any;
  export function useEffect(effect: () => void | (() => void), dependencies?: unknown[]): void;
  export function useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
}

declare namespace JSX {
  interface IntrinsicAttributes {
    key?: string | number | null;
  }

  interface IntrinsicElements {
    [elementName: string]: any;
  }
}
