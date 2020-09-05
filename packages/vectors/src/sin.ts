import type { MultiVecOpV, VecOpV } from "./api";
import { defFnOp } from "./internal/codegen";

export const [sin, sin2, sin3, sin4] = defFnOp<MultiVecOpV, VecOpV>("Math.sin");
