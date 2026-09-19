/* Renders a share of one keyframe of the fractal zoom (every rowStep-th row), off the main
 * thread, and sends it back coloured. See zoom.js. */
/* global importScripts, ChaosZoomMath */
importScripts("zoom-math.js");

self.onmessage = ({ data: job }) => {
	const rows = Math.ceil((job.h - job.firstRow) / job.rowStep);
	const mu = new Float32Array(rows * job.w);
	const stats = ChaosZoomMath.render(job, mu);
	const rgba = new Uint8ClampedArray(rows * job.w * 4);
	ChaosZoomMath.colorize(mu, rgba);
	self.postMessage({ id: job.id, firstRow: job.firstRow, rgba, stats }, [rgba.buffer]);
};
