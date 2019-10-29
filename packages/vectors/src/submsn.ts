import { VecOpSVNV } from "./api";
import { ARGS_VVN, defOpS, SARGS_VV } from "./internal/codegen";
import { MATH2_N } from "./internal/templates";

export const [submSN2, submSN3, submSN4] = defOpS<VecOpSVNV>(
    MATH2_N("-", "*"),
    `${ARGS_VVN},${SARGS_VV}`
);
