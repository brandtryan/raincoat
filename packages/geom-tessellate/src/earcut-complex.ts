import type { Nullable, Predicate } from "@thi.ng/api";
import type { Tessellator } from "@thi.ng/geom-api";
import { bounds2 } from "@thi.ng/geom-poly-utils/bounds";
import { sign } from "@thi.ng/math/abs";
import { mux2 } from "@thi.ng/morton/mux";
import type { ReadonlyVec } from "@thi.ng/vectors";

/**
 * Higher-order tessellator, implementing an ear slicing triangulation
 * algorithm, optimized by Morton/Z-curve hashing and able to handle complex
 * polygons with holes, twists, degeneracies and self-intersections.
 *
 * @remarks
 * This is an adapted version of https://github.com/mapbox/earcut with the
 * following changes to the original implementation:
 *
 * - Input points given as array of points (not flattened, only 2D supported)
 * - Appends results to given tessellation instance as per contract of all
 *   tessellators in this package
 * - Configurable Z-curve hashing threshold (default: 80)
 * - If Z-curve hashing is used, points are pre-scaled once internally for
 *   various simplifications and to avoid passing extraneous args around
 * - Use unsigned 16 bits (per coord) hashing (instead of 15 bits)
 * - Re-use existing thi.ng/umbrella fns for some processing steps
 * - Add small tolerance for colinear check
 * - Rename `Node` => `Vertex`
 * - Minor other refactoring (use of destructuring, add types, renames etc.)
 *
 * Original implementation Copyright (c) 2016, Mapbox, ISC License. Original
 * author: Volodymyr Agafonkin
 *
 * References:
 *
 * - https://www.cosy.sbg.ac.at/~held/projects/triang/triang.html
 * - https://www.geometrictools.com/Documentation/TriangulationByEarClipping.pdf
 * - https://docs.thi.ng/umbrella/morton/
 *
 * @param holeIDs
 * @param threshold
 */
export const earCutComplex =
	(holeIDs: number[] = [], threshold = 80): Tessellator =>
	(tess, pids) => {
		let points = pids.map((i) => tess.points[i]);
		const indices = tess.indices;
		const hasHoles = !!holeIDs.length;
		const outerLen = hasHoles ? holeIDs[0] : points.length;
		let scale = 0;
		if (points.length >= threshold) {
			const [[minX, minY], [maxX, maxY]] = bounds2(points, 0, outerLen);
			scale = Math.max(maxX - minX, maxY - minY);
			if (scale > 0) {
				scale = 0xffff / scale;
				points = points.map((p) => [
					(p[0] - minX) * scale,
					(p[1] - minY) * scale,
				]);
			}
		}
		let outerNode = buildVertexList(points, pids, 0, outerLen, true);
		if (!outerNode || outerNode.n === outerNode.p) return tess;
		if (hasHoles) {
			outerNode = eliminateHoles(points, pids, holeIDs, outerNode);
		} else {
			outerNode = removeColinear(outerNode);
		}
		earcutLinked(outerNode, indices, scale > 0 ? isEarHashed : isEar);
		return tess;
	};

/**
 * Takes an array of `boundary` points and another array of `holes` containing
 * point arrays of individual holes. Concatenates all points (both boundary &
 * holes) and returns a tuple of `[points, holeIDs]`, suitable for
 * {@link earCutComplex}.
 *
 * @example
 * ```ts tangle:../export/earcut-complex.ts
 * import {
 *   earCutComplex, earCutComplexPrepare, tessellate
 * } from "@thi.ng/geom-tessellate";
 *
 * const boundary = [[0,0], [100,0], [100,100], [0,100]];
 * const hole = [[20,20],[50,80],[80,20]];
 *
 * const [points, holeIDs] = earCutComplexPrepare(boundary, [hole]);
 *
 * const tess = tessellate(points, earCutComplex(holeIDs));
 *
 * console.log(tess);
 * // {
 * //   points: [
 * //     [ 0, 0 ], [ 100, 0 ], [ 100, 100 ], [ 0, 100 ],
 * //     [ 20, 20 ], [ 50, 80 ], [ 80, 20 ]
 * //   ],
 * //   indices: [
 * //     [ 0, 4, 5 ], [ 6, 4, 0 ], [ 3, 0, 5 ], [ 6, 0, 1 ],
 * //     [ 2, 3, 5 ], [ 5, 6, 1 ], [ 1, 2, 5 ]
 * //   ],
 * // }
 * ```
 *
 * @param boundary
 * @param holes
 */
export const earCutComplexPrepare = (
	boundary: ReadonlyVec[],
	holes: ReadonlyVec[][]
) => {
	let points = boundary;
	const holeIDs: number[] = [];
	for (let hole of holes) {
		holeIDs.push(points.length);
		points = points.concat(hole);
	}
	return <[ReadonlyVec[], number[]]>[points, holeIDs];
};

class Vertex {
	i: number;
	x: number;
	y: number;
	p: Nullable<Vertex> = null;
	n: Nullable<Vertex> = null;
	pz: Nullable<Vertex> = null;
	nz: Nullable<Vertex> = null;
	z = -1;
	s = false;

	constructor(i: number, x: number, y: number) {
		this.i = i;
		this.x = x;
		this.y = y;
	}
}

const buildVertexList = (
	points: ReadonlyVec[],
	pids: number[],
	start: number,
	end: number,
	clockwise: boolean
) => {
	let last: Nullable<Vertex>;
	if (clockwise === signedArea(points, start, end) > 0) {
		for (let i = start; i < end; i++)
			last = insertVertex(pids[i], points[i], last);
	} else {
		for (let i = end - 1; i >= start; i--)
			last = insertVertex(pids[i], points[i], last);
	}
	if (last && equals(last, last.n!)) {
		removeVertex(last);
		last = last.n!;
	}
	return last;
};

const insertVertex = (
	i: number,
	[x, y]: ReadonlyVec,
	last: Nullable<Vertex>
) => {
	const v = new Vertex(i, x, y);
	if (!last) {
		v.p = v.n = v;
	} else {
		v.n = last.n;
		v.p = last;
		last.n = last.n!.p = v;
	}
	return v;
};

const removeVertex = (v: Vertex) => {
	v.n!.p = v.p;
	v.p!.n = v.n;
	if (v.pz) v.pz.nz = v.nz;
	if (v.nz) v.nz.pz = v.pz;
};

/**
 * Main ear slicing loop which triangulates a polygon (given as a linked list).
 *
 * @param ear
 * @param triangles
 * @param pred
 * @param pass
 */
const earcutLinked = (
	ear: Nullable<Vertex>,
	triangles: number[][],
	pred: Predicate<Vertex>,
	pass = 0
) => {
	if (!ear) return;
	if (!pass && pred === isEarHashed) zIndexCurve(ear);

	let stop = ear;
	// iterate through ears, slicing them one by one
	while (ear!.p !== ear!.n) {
		const { p: prev, n: next } = <Vertex>ear;
		if (pred(ear!)) {
			triangles.push([prev!.i, ear!.i, next!.i]);
			removeVertex(ear!);
			// skipping the next vertex leads to less sliver triangles
			ear = stop = next!.n!;
			continue;
		}
		ear = next!;

		// if we looped through the whole remaining polygon and can't find any more ears
		if (ear === stop) {
			// try filtering points and slicing again
			if (pass === 0) {
				earcutLinked(removeColinear(ear), triangles, pred, 1);
			} else if (pass === 1) {
				// if this didn't work, try curing all small self-intersections locally
				ear = cureLocalIntersections(removeColinear(ear)!, triangles);
				earcutLinked(ear, triangles, pred, 2);
			} else if (pass === 2) {
				// as a last resort, try splitting the remaining polygon into two
				splitEarcut(ear, triangles, pred);
			}
			break;
		}
	}
};

/**
 * Try splitting polygon into two and triangulate them independently.
 *
 * @param start
 * @param triangles
 * @param pred
 */
const splitEarcut = (
	start: Vertex,
	triangles: number[][],
	pred: Predicate<Vertex>
) => {
	// find valid diagonal dividing the polygon into two
	let a = start;
	do {
		let b = a.n!.n!;
		while (b !== a.p) {
			if (a.i !== b.i && isValidDiagonal(a, b)) {
				// split the polygon in two by the diagonal
				let c = splitPolygon(a, b);
				a = removeColinear(a, a.n!)!;
				c = removeColinear(c, c.n!)!;
				earcutLinked(a, triangles, pred, 0);
				earcutLinked(c, triangles, pred, 0);
				return;
			}
			b = b!.n!;
		}
		a = a.n!;
	} while (a !== start);
};

/**
 * Links two polygon vertices with a bridge; if the vertices belong to the same
 * ring, it splits polygon into two; if one belongs to the outer ring and
 * another to a hole, it merges it into a single ring
 *
 * @param a
 * @param b
 */
const splitPolygon = (a: Vertex, b: Vertex) => {
	const a2 = new Vertex(a.i, a.x, a.y);
	const b2 = new Vertex(b.i, b.x, b.y);
	const an = a.n!;
	const bp = b.p!;
	a.n = b;
	b.p = a;
	a2.n = an;
	an.p = a2;
	b2.n = a2;
	a2.p = b2;
	bp.n = b2;
	b2.p = bp;
	return b2;
};

/**
 * Check if the middle point of a polygon diagonal is inside the polygon
 *
 * @param a
 * @param b
 */
const isEdgeCentroidInside = (a: Vertex, b: Vertex) => {
	const mx = (a.x + b.x) * 0.5;
	const my = (a.y + b.y) * 0.5;
	let v = a;
	let inside = false;
	do {
		const { x: px, y: py, n: vn } = v;
		if (
			vn!.y !== py &&
			py > my !== vn!.y > my &&
			mx < ((vn!.x - px) * (my - py)) / (vn!.y - py) + px
		)
			inside = !inside;
		v = vn!;
	} while (v !== a);
	return inside;
};

/**
 * Check if a polygon diagonal is locally inside the polygon
 *
 * @param a
 * @param b
 */
const isLocallyInside = (a: Vertex, b: Vertex) =>
	area(a.p!, a, a.n!) < 0
		? area(a, b, a.n!) >= 0 && area(a, a.p!, b) >= 0
		: area(a, b, a.p!) < 0 || area(a, a.n!, b) < 0;

/**
 * Check if a polygon diagonal intersects any polygon segments.
 *
 * @param a
 * @param b
 */
const intersectsPolygon = (a: Vertex, b: Vertex) => {
	let v = a;
	const ai = a.i;
	const bi = b.i;
	do {
		if (
			v.i !== ai &&
			v.i !== bi &&
			v.n!.i !== ai &&
			v.n!.i !== bi &&
			intersects(v, v.n!, a, b)
		)
			return true;
		v = v.n!;
	} while (v !== a);
	return false;
};

const intersects = (p1: Vertex, q1: Vertex, p2: Vertex, q2: Vertex) => {
	const o1 = sign(area(p1, q1, p2));
	const o2 = sign(area(p1, q1, q2));
	const o3 = sign(area(p2, q2, p1));
	const o4 = sign(area(p2, q2, q1));
	if (o1 !== o2 && o3 !== o4) return true; // general case
	if (o1 === 0 && onSegment(p1, p2, q1)) return true; // p1, q1 and p2 are collinear and p2 lies on p1q1
	if (o2 === 0 && onSegment(p1, q2, q1)) return true; // p1, q1 and q2 are collinear and q2 lies on p1q1
	if (o3 === 0 && onSegment(p2, p1, q2)) return true; // p2, q2 and p1 are collinear and p1 lies on p2q2
	if (o4 === 0 && onSegment(p2, q1, q2)) return true; // p2, q2 and q1 are collinear and q1 lies on p2q2
	return false;
};

/**
 * For collinear points p, q, r, check if point q lies on segment pr
 *
 * @param p
 * @param q
 * @param r
 */
const onSegment = (
	{ x: px, y: py }: Vertex,
	{ x: qx, y: qy }: Vertex,
	{ x: rx, y: ry }: Vertex
) =>
	qx <= Math.max(px, rx) &&
	qx >= Math.min(px, rx) &&
	qy <= Math.max(py, ry) &&
	qy >= Math.min(py, ry);

/**
 * Check if a diagonal between two polygon nodes is valid (lies in polygon
 * interior)
 *
 * @param a
 * @param b
 */
const isValidDiagonal = (a: Vertex, b: Vertex) =>
	a.n!.i !== b.i &&
	a.p!.i !== b.i &&
	!intersectsPolygon(a, b) &&
	((isLocallyInside(a, b) &&
		isLocallyInside(b, a) &&
		// locally visible
		isEdgeCentroidInside(a, b) &&
		// does not create opposite-facing sectors
		(area(a.p!, a, b.p!) || area(a, b.p!, b))) ||
		// special zero-length case
		(equals(a, b) && area(a.p!, a, a.n!) > 0 && area(b.p!, b, b.n!) > 0));

const isPointInTriangle = (
	{ x, y }: Vertex,
	ax: number,
	ay: number,
	bx: number,
	by: number,
	cx: number,
	cy: number
) =>
	(cx - x) * (ay - y) >= (ax - x) * (cy - y) &&
	(ax - x) * (by - y) >= (bx - x) * (ay - y) &&
	(bx - x) * (cy - y) >= (cx - x) * (by - y);

const isPointInRect = (
	{ x, y }: Vertex,
	x0: number,
	y0: number,
	x1: number,
	y1: number
) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

const findLeftmost = (start: Vertex) => {
	let left = start;
	let v = start;
	do {
		if (v.x < left.x || (v.x === left.x && v.y < left.y)) left = v;
		v = v.n!;
	} while (v !== start);
	return left;
};

/**
 * Simon Tatham's linked list merge sort algorithm:
 * http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
 *
 * @param $list
 */
const sortLinked = (list: Nullable<Vertex>) => {
	let numMerges;
	let inSize = 1;

	do {
		let p = list;
		let tail: Nullable<Vertex> = (list = null);
		let q: Nullable<Vertex>, e: Nullable<Vertex>;
		numMerges = 0;

		while (p) {
			numMerges++;
			q = p;
			let pSize = 0;
			for (let i = 0; i < inSize; i++) {
				pSize++;
				q = q.nz;
				if (!q) break;
			}

			let qSize = inSize;
			while (pSize > 0 || (qSize > 0 && q)) {
				if (pSize !== 0 && (qSize === 0 || !q || p!.z <= q.z)) {
					e = p;
					p = p!.nz;
					pSize--;
				} else {
					e = q;
					q = q!.nz;
					qSize--;
				}

				if (tail) tail.nz = e;
				else list = e;

				e!.pz = tail;
				tail = e;
			}
			p = q;
		}

		tail!.nz = null;
		inSize *= 2;
	} while (numMerges > 1);

	return list;
};

/**
 * Interlink polygon nodes in z-order.
 *
 * @param start
 */
const zIndexCurve = (start: Vertex) => {
	let v = start;
	do {
		if (v.z < 0) v.z = mux2(v.x, v.y);
		v.pz = v.p;
		v = v.nz = v.n!;
	} while (v !== start);
	v.pz!.nz = v.pz = null;
	sortLinked(v);
};

/**
 * Whether sector in vertex `m` contains sector in vertex `p` in the same
 * coordinates.
 *
 * @param m
 * @param p
 */
const sectorContainsSector = (m: Vertex, p: Vertex) =>
	area(m.p!, m, p.p!) < 0 && area(p.n!, m, m.n!) < 0;

/**
 * David Eberly's algorithm for finding a bridge between hole and outer polygon.
 *
 * @param hole
 * @param outer
 */
const findHoleBridge = (hole: Vertex, outer: Vertex): Nullable<Vertex> => {
	const { x: hx, y: hy } = hole;
	let v = outer;
	let qx = -Infinity;
	let px: number, py: number;
	let pnx: number, pny: number;
	let m: Nullable<Vertex>;

	// find a segment intersected by a ray from the hole's leftmost point to the left;
	// segment's endpoint with lesser x will be potential connection point
	do {
		({ x: px, y: py } = v);
		({ x: pnx, y: pny } = v.n!);
		if (hy <= py && hy >= pny && pny !== py) {
			const x = px + ((hy - py) * (pnx - px)) / (pny - py);
			if (x <= hx && x > qx) {
				qx = x;
				m = px < pnx ? v : v.n;
				// hole touches outer segment; pick leftmost endpoint
				if (x === hx) return m;
			}
		}
		v = v.n!;
	} while (v !== outer);

	if (!m) return null;

	// look for points inside the triangle of hole point, segment intersection and endpoint;
	// if there are no points found, we have a valid connection;
	// otherwise choose the point of the minimum angle with the ray as connection point

	const stop = m;
	const { x: mx, y: my } = m;
	let tanMin = Infinity;
	let tan;

	v = m;
	do {
		({ x: px, y: py } = v);
		if (
			hx >= px &&
			px >= mx &&
			hx !== px &&
			isPointInTriangle(
				v,
				hy < my ? hx : qx,
				hy,
				mx,
				my,
				hy < my ? qx : hx,
				hy
			)
		) {
			tan = Math.abs(hy - py) / (hx - px); // tangential
			if (
				isLocallyInside(v, hole) &&
				(tan < tanMin ||
					(tan === tanMin &&
						(px > m.x ||
							(px === m.x && sectorContainsSector(m, v)))))
			) {
				m = v;
				tanMin = tan;
			}
		}
		v = v.n!;
	} while (v !== stop);

	return m;
};

/**
 * Find a bridge between vertices that connects hole with an outer ring and and
 * link it.
 *
 * @param hole
 * @param outerNode
 */
const eliminateHole = (hole: Vertex, outerNode: Vertex) => {
	const bridge = findHoleBridge(hole, outerNode);
	if (!bridge) return outerNode;

	const bridgeReverse = splitPolygon(bridge, hole);
	// filter collinear points around the cuts
	removeColinear(bridgeReverse, bridgeReverse.n!);
	return removeColinear(bridge, bridge.n!)!;
};

/**
 * link every hole into the outer loop, producing a single-ring polygon without
 * holes.
 *
 * @param points
 * @param holeIndices
 * @param outerNode
 */
const eliminateHoles = (
	points: ReadonlyVec[],
	pids: number[],
	holeIndices: number[],
	outerNode: Vertex
) => {
	const queue: Vertex[] = [];
	for (let i = 0, num = holeIndices.length; i < num; i++) {
		const start = holeIndices[i];
		const end = i < num - 1 ? holeIndices[i + 1] : points.length;
		const list = buildVertexList(points, pids, start, end, false)!;
		if (list === list!.n) list.s = true;
		queue.push(findLeftmost(list));
	}
	// process holes from left to right
	queue.sort((a, b) => a.x - b.x);
	for (let i = 0, n = queue.length; i < n; i++) {
		outerNode = eliminateHole(queue[i], outerNode);
	}
	return outerNode;
};

/**
 * Go through all polygon nodes and cure small local self-intersections
 *
 * @param start
 * @param triangles
 */
const cureLocalIntersections = (start: Vertex, triangles: number[][]) => {
	let v = start;
	do {
		const a = v.p!;
		const b = v.n!.n!;
		if (
			!equals(a, b) &&
			isLocallyInside(a, b) &&
			isLocallyInside(b, a) &&
			intersects(a, v, v.n!, b)
		) {
			triangles.push([a.i, v.i, b.i]);
			removeVertex(v);
			removeVertex(v.n!);
			v = start = b;
		}
		v = v.n!;
	} while (v !== start);
	return removeColinear(v);
};

/**
 * Checks whether a polygon node forms a valid ear with adjacent nodes
 *
 * @param ear
 */
const isEar = (ear: Vertex) => {
	const { p: a, n: c } = ear;
	const b = ear;
	// reflex, can't be an ear
	if (area(a!, b, c!) >= 0) return false;

	const { x: ax, y: ay } = a!,
		{ x: bx, y: by } = b,
		{ x: cx, y: cy } = c!;
	const [x0, y0, x1, y1] = triBounds(ax, ay, bx, by, cx, cy);

	let v = c!.n!;
	while (v !== a) {
		if (
			isPointInRect(v, x0, y0, x1, y1) &&
			isPointInTriangle(v, ax, ay, bx, by, cx, cy) &&
			area(v.p!, v, v.n!) >= 0
		)
			return false;
		v = v.n!;
	}
	return true;
};

/**
 * Z-order hashed version of {@link isEar}.
 *
 * @param ear
 */
const isEarHashed = (ear: Vertex) => {
	const { p: a, n: c } = ear;
	const b = ear;
	// reflex, can't be an ear
	if (area(a!, b, c!) >= 0) return false;

	const { x: ax, y: ay } = a!;
	const { x: bx, y: by } = b;
	const { x: cx, y: cy } = c!;
	const [x0, y0, x1, y1] = triBounds(ax, ay, bx, by, cx, cy);
	// z-order range for the current triangle bbox;
	const minZ = mux2(x0, y0);
	const maxZ = mux2(x1, y1);

	const check = (v: Vertex) =>
		v !== a &&
		v !== c &&
		isPointInRect(v, x0, y0, x1, y1) &&
		isPointInTriangle(v, ax, ay, bx, by, cx, cy) &&
		area(v.p!, v, v.n!) >= 0;

	let { pz: p, nz: n } = ear;
	// look for points inside the triangle in both directions
	while (p && p.z >= minZ && n && n.z <= maxZ) {
		if (check(p)) return false;
		p = p.pz;
		if (check(n)) return false;
		n = n.nz;
	}
	// look for remaining points in decreasing z-order
	while (p && p.z >= minZ) {
		if (check(p)) return false;
		p = p.pz;
	}
	// look for remaining points in increasing z-order
	while (n && n.z <= maxZ) {
		if (check(n)) return false;
		n = n.nz;
	}
	return true;
};

/**
 * Eliminate colinear or duplicate points.
 *
 * @param start
 * @param end
 */
const removeColinear = (start: Nullable<Vertex>, end = start) => {
	if (!start) return start;
	let v = start;
	let repeat: boolean;
	do {
		repeat = false;
		if (!v.s && (equals(v, v.n!) || sign(area(v.p!, v, v.n!)) === 0)) {
			removeVertex(v);
			v = end = v.p!;
			if (v === v.n) break;
			repeat = true;
		} else {
			v = v.n!;
		}
	} while (repeat || v !== end);
	return end;
};

/**
 * Signed area of a triangle.
 *
 * @param a
 * @param b
 * @param c
 */
const area = (a: Vertex, { x: bx, y: by }: Vertex, c: Vertex) =>
	(by - a.y) * (c.x - bx) - (bx - a.x) * (c.y - by);

/**
 * Computes signed area of the ring in [start,end) range.
 *
 * @param points
 * @param start
 * @param end
 */
const signedArea = (points: ReadonlyVec[], start: number, end: number) => {
	let sum = 0;
	for (let i = start, j = end - 1; i < end; j = i, i++) {
		const a = points[j];
		const b = points[i];
		sum += (a[0] - b[0]) * (a[1] + b[1]);
	}
	return sum;
};

const triBounds = (
	ax: number,
	ay: number,
	bx: number,
	by: number,
	cx: number,
	cy: number
) => [
	ax < bx ? (ax < cx ? ax : cx) : bx < cx ? bx : cx,
	ay < by ? (ay < cy ? ay : cy) : by < cy ? by : cy,
	ax > bx ? (ax > cx ? ax : cx) : bx > cx ? bx : cx,
	ay > by ? (ay > cy ? ay : cy) : by > cy ? by : cy,
];

const equals = (pa: Vertex, b: Vertex) => pa.x === b.x && pa.y === b.y;