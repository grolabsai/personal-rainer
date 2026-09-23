// Types for body-map.js, so the TypeScript app can use the same module as the mock pages.
export type MuscleState = 'primary' | 'secondary' | 'stabiliser' | 'added' | 'dropped' | '' | null | undefined;
export type BodyView = 'front' | 'back';
export declare function bodyMap(opts: {
  states?: Record<string, MuscleState>;
  width?: number;
  views?: BodyView[];
  labels?: boolean;
  title?: string;
}): string;
export declare function viewsFor(states?: Record<string, MuscleState>): BodyView[];
export declare const BODY_MAP_CSS: string;
export declare function partFor(muscleId: string): string;
export declare const SUB_PARTS: Record<string, string[]>;
