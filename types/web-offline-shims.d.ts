declare module "react" {
  export type ReactNode = unknown;
}

declare namespace JSX {
  interface IntrinsicAttributes {
    key?: string | number | null;
  }

  interface IntrinsicElements {
    [elementName: string]: any;
  }
}
