import { useEffect, useRef, useState } from "react";

const INTERACTIVE_SELECTORS = "button, a, [role='button'], input, .portal-hitbox, .wordle-key, .segment, .mode-card, .mode-link";

export function CursorGlow() {
  const glowRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef({ x: -999, y: -999 });
  const rafRef = useRef<number>(0);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;

    function tick() {
      if (glow) {
        glow.style.left = `${posRef.current.x}px`;
        glow.style.top  = `${posRef.current.y}px`;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    const onMove = (e: PointerEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      setHovering(Boolean(target?.closest(INTERACTIVE_SELECTORS)));
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("mouseover", onOver);
    };
  }, []);

  return (
    <div
      ref={glowRef}
      className={`cursor-glow${hovering ? " is-hovering" : ""}`}
      aria-hidden="true"
    />
  );
}
