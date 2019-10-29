import { VecOpSVN } from "./api";
import {
    ARGS_V,
    ARGS_VN,
    defOpS,
    SARGS_V
} from "./internal/codegen";
import { MATH_N } from "./internal/templates";

export const [subSN2, subSN3, subSN4] = defOpS<VecOpSVN>(
    MATH_N("-"),
    `${ARGS_VN},${SARGS_V}`,
    ARGS_V
);
