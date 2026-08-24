import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  icon?: IconName;
  iconOnly?: boolean;
  tone?: "default" | "primary" | "quiet" | "danger";
}

export function Button({
  children,
  className = "",
  icon,
  iconOnly = false,
  tone = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button--${tone}${iconOnly ? " button--icon" : ""} ${className}`}
      type={type}
      {...props}
    >
      {icon ? <Icon name={icon} size={iconOnly ? 18 : 16} /> : null}
      {children}
    </button>
  );
}

