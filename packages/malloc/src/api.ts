import { IRelease, Type, TypedArray } from "@thi.ng/api";

export interface MemBlock {
    addr: number;
    size: number;
    next: MemBlock | null;
}

export interface MemPoolOpts {
    buf: ArrayBuffer;
    size: number;
    /**
     * Start is the anchor index inside the arraybuffer, so we can't save it inside the arraybuffer itself.
     * If you pass the ArrayBuffer to other consumers they must use the same start value
     */
    start: number;
    end: number;
    compact: boolean;
    split: boolean;
    minSplit: number;
    skipInitialization: boolean
}

export interface MemPoolStats {
    /**
     * Free block stats.
     */
    free: { count: number; size: number };
    /**
     * Used block stats.
     */
    used: { count: number; size: number };
    /**
     * Current top address.
     */
    top: number;
    /**
     * Bytes available
     */
    available: number;
    /**
     * Total pool size.
     */
    total: number;
}

export interface IMemPool extends IRelease {
    malloc(size: number): number;

    calloc(size: number): number;

    mallocAs(type: Type, num: number): TypedArray | undefined;

    callocAs(type: Type, num: number): TypedArray | undefined;

    realloc(ptr: number, size: number): number;

    reallocArray(arr: TypedArray, num: number): TypedArray | undefined;

    free(ptr: number | TypedArray): boolean;

    freeAll(): void;

    stats(): MemPoolStats;
}

export type BlockCtor = (
    buf: ArrayBuffer,
    addr: number,
    num: number
) => TypedArray;
