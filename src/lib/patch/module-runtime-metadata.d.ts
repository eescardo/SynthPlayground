import type { IntrinsicParamSchema } from "@/types/patch";

export const INTRINSIC_PARAMS_BY_TYPE: Partial<Record<string, IntrinsicParamSchema[]>>;

export const getIntrinsicParamsForType: (typeId: string) => IntrinsicParamSchema[];
