// Types for variation-language.js.
export declare const FAMILY: Record<string, string>;
export declare function familyOf(dimensionId: string): string;
export declare const DIMENSION_ORDER: string[];
export declare function dimensionRank(id: string): number;
export declare function differingFamilies(
  variants: { attributes?: { dimension_id: string; value: string }[]; equipment?: ({ equipment_id: string } | string)[] }[],
): Set<string>;
