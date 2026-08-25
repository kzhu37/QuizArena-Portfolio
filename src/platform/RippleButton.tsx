import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";

interface RippleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function RippleButton({ children, onClick, className = "", ...rest }: RippleButtonProps) {
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.8;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top  - size / 2;

    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
    btn.appendChild(ripple);

    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });

    onClick?.(e);
  }

  return (
    <button className={className} onClick={handleClick} {...rest}>
      {children}
    </button>
  );
}
