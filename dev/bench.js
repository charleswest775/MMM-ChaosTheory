/* Drawing micro-benchmarks, run inside MagicMirror on the Pi to see what the software
 * canvas actually charges for. Not part of the module's scripts: to use, add
 * "dev/bench.js" to getScripts temporarily and set simulations: ["bench"], benchMode: "…".
 */
(function (root) {
	class Bench {
		constructor ({ benchMode = "none" } = {}) {
			this.mode = benchMode;
			this.t = 0;
			this.pts = Array.from({ length: 4000 }, (_, i) => [Math.sin(i * 0.37) * 0.45 + 0.5, Math.cos(i * 0.23) * 0.45 + 0.5]);
		}

		step (dt) { this.t += dt; }

		draw (ctx, w, h) {
			const m = this.mode, s = (this.t * 3) % 1;
			if (m === "none") return;
			if (m === "tiny") { ctx.fillStyle = `hsl(${this.t * 50}, 80%, 50%)`; ctx.fillRect(0, 0, 4, 4); return; }
			if (m.startsWith("clear")) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h); }
			if (m.includes("path")) {
				ctx.globalCompositeOperation = m.includes("lighter") ? "lighter" : "source-over";
				ctx.strokeStyle = "#4d9bff"; ctx.lineWidth = m.includes("path1") ? 1 : 1.6; ctx.globalAlpha = m.includes("opaque") ? 1 : 0.8;
				ctx.beginPath();
				this.pts.forEach(([x, y], i) => (i ? ctx.lineTo((x + s * 0.05) * w, y * h) : ctx.moveTo(x * w, y * h)));
				ctx.stroke();
				ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
			}
			if (m === "putimage") {
				// what the logistic map's marker costs: put back 5 columns of a saved image
				this.img = this.img || ctx.createImageData(w, h);
				const c = Math.floor(this.t * 40) % (w - 5);
				ctx.putImageData(this.img, 0, 0, c, 0, 5, h);
			}
			if (m === "segments") {
				// what an accumulating trail costs: a few new segments per frame, no clear
				ctx.strokeStyle = `hsl(${this.t * 50}, 80%, 60%)`; ctx.lineWidth = 1.6;
				ctx.beginPath();
				for (let k = 0; k < 9; k++) {
					const a = this.t * 2 + k * 0.01;
					ctx.lineTo(w / 2 + Math.sin(a * 1.3) * w * 0.4, h / 2 + Math.cos(a * 1.7) * h * 0.4);
				}
				ctx.stroke();
			}
		}
	}

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.bench = Bench;
})(typeof window !== "undefined" ? window : globalThis);
