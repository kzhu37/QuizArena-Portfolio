import { useEffect, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;       // 0–1, decreasing
  decay: number;
  size: number;
  color: string;
  type: "drift" | "burst" | "confetti";
  rotation?: number;
  rotationSpeed?: number;
}

// ── Palette ────────────────────────────────────────────────────────────

const BURST_COLORS  = ["#f8d467", "#ffeb9c", "#865cff", "#c4a8ff", "#7ceeff", "#f09dff"];
const DRIFT_COLORS  = ["rgba(134,92,255,0.55)", "rgba(248,212,103,0.45)", "rgba(124,238,255,0.4)"];
const CONFETTI_COLORS = ["#f8d467", "#7ef3ba", "#7ceeff", "#f09dff", "#865cff", "#ff7c92", "#ffeb9c"];

// ── Singleton particle store (shared across mounts) ────────────────────

let particles: Particle[] = [];
let driftSeeded = false;

function seedDrift(w: number, h: number) {
  if (driftSeeded) return;
  driftSeeded = true;
  for (let i = 0; i < 28; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.28,
      vy: -(Math.random() * 0.22 + 0.06),
      life: Math.random(),
      decay: 0.0008 + Math.random() * 0.0006,
      size: 2 + Math.random() * 3.5,
      color: DRIFT_COLORS[Math.floor(Math.random() * DRIFT_COLORS.length)],
      type: "drift"
    });
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export function burstPortal(x: number, y: number) {
  for (let i = 0; i < 38; i++) {
    const angle = (Math.PI * 2 * i) / 38 + Math.random() * 0.4;
    const speed = 2.4 + Math.random() * 4.2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      life: 1,
      decay: 0.018 + Math.random() * 0.012,
      size: 3 + Math.random() * 5,
      color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
      type: "burst"
    });
  }
}

export function burstConfetti(x: number, y: number) {
  for (let i = 0; i < 52; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const speed = 3 + Math.random() * 6;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.012 + Math.random() * 0.01,
      size: 5 + Math.random() * 6,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      type: "confetti",
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.22
    });
  }
}

// ── Component ──────────────────────────────────────────────────────────

export function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      seedDrift(canvas.width, canvas.height);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });

    function draw() {
      if (!canvas || !ctx) return;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Physics
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += p.type === "drift" ? 0 : 0.09;   // gravity for burst/confetti
        p.vx *= 0.992;
        p.life -= p.decay;

        if (p.type === "drift") {
          // Wrap drift particles
          if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; p.life = 0.6 + Math.random() * 0.4; }
          if (p.x < -10) p.x = W + 10;
          if (p.x > W + 10) p.x = -10;
        }

        if (p.life <= 0) {
          if (p.type === "drift") {
            // Respawn drift
            p.x = Math.random() * W;
            p.y = H + 10;
            p.life = 0.7 + Math.random() * 0.3;
            p.vx = (Math.random() - 0.5) * 0.28;
            p.vy = -(Math.random() * 0.22 + 0.06);
          } else {
            particles.splice(i, 1);
            continue;
          }
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life) * (p.type === "drift" ? 0.55 : 0.9);

        if (p.type === "confetti") {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation ?? 0);
          if (p.rotationSpeed) p.rotation = (p.rotation ?? 0) + p.rotationSpeed;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          if (p.type === "burst") {
            ctx.shadowBlur  = 12;
            ctx.shadowColor = p.color;
          }
          ctx.fill();
        }

        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      // Reset drift seed so it re-seeds on next mount
      driftSeeded = false;
      particles = particles.filter((p) => p.type !== "drift");
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="particle-canvas"
      aria-hidden="true"
    />
  );
}
