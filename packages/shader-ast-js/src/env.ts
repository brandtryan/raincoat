import {
    mat22n,
    mat22v,
    mat33n,
    mat33v,
    mat44n,
    mat44v
} from "@thi.ng/matrices";
import {
    setSwizzle2,
    setSwizzle3,
    setSwizzle4,
    setVN3,
    setVN4,
    setVV4,
    swizzle2,
    swizzle3,
    swizzle4,
    ZERO3,
    ZERO4
} from "@thi.ng/vectors";
import { FLOAT } from "./env/float";
import { INT } from "./env/int";
import { IVEC2 } from "./env/ivec2";
import { IVEC3 } from "./env/ivec3";
import { IVEC4 } from "./env/ivec4";
import { MAT2 } from "./env/mat2";
import { MAT3 } from "./env/mat3";
import { MAT4 } from "./env/mat4";
import { UINT } from "./env/uint";
import { UVEC2 } from "./env/uvec2";
import { UVEC3 } from "./env/uvec3";
import { UVEC4 } from "./env/uvec4";
import { VEC2 } from "./env/vec2";
import { VEC3 } from "./env/vec3";
import { VEC4 } from "./env/vec4";
import type { JSBuiltinsSampler, JSEnv } from "./api";

// TODO texture lookups
// all texture fns currently return [0,0,0,0] or 0
const SAMPLER_TODO: JSBuiltinsSampler = {
    texelFetch: () => ZERO4,
    texelFetchOffset: () => ZERO4,
    texture: () => ZERO4,
    texturen: () => 0,
    textureGrad: () => ZERO4,
    textureGradn: () => 0,
    textureLod: () => ZERO4,
    textureLodn: () => 0,
    textureOffset: () => ZERO4,
    textureOffsetn: () => 0,
    textureProj: () => ZERO4,
    textureProjn: () => 0,
    textureSize: () => ZERO3
};

export const JS_DEFAULT_ENV: JSEnv = {
    vec2n: (n) => [n, n],
    vec3n: (n) => [n, n, n],
    vec4n: (n) => [n, n, n, n],
    vec3vn: (a, n) => setVN3([], a, n),
    vec4vn: (a, n) => setVN4([], a, n),
    vec4vnn: (a, z, w) => setVV4([], a, [z, w]),
    vec4vv: (a, b) => setVV4([], a, b),
    mat2n: (n) => mat22n([], n),
    mat2vv: (a, b) => mat22v([], a, b),
    mat3n: (n) => mat33n([], n),
    mat3vvv: (a, b, c) => mat33v([], a, b, c),
    mat4n: (n) => mat44n([], n),
    mat4vvvv: (a, b, c, d) => mat44v([], a, b, c, d),
    swizzle2: (a, b, c) => swizzle2([], a, b, c),
    swizzle3: (a, b, c, d) => swizzle3([], a, b, c, d),
    swizzle4: (a, b, c, d, e) => swizzle4([], a, b, c, d, e),
    set_swizzle2: setSwizzle2,
    set_swizzle3: setSwizzle3,
    set_swizzle4: setSwizzle4,
    float: FLOAT,
    int: INT,
    uint: UINT,
    vec2: VEC2,
    vec3: VEC3,
    vec4: VEC4,
    ivec2: IVEC2,
    ivec3: IVEC3,
    ivec4: IVEC4,
    uvec2: UVEC2,
    uvec3: UVEC3,
    uvec4: UVEC4,
    mat2: MAT2,
    mat3: MAT3,
    mat4: MAT4,
    sampler1D: SAMPLER_TODO,
    sampler2D: SAMPLER_TODO,
    sampler3D: SAMPLER_TODO,
    samplerCube: SAMPLER_TODO,
    sampler2DShadow: SAMPLER_TODO,
    samplerCubeShadow: SAMPLER_TODO
};
