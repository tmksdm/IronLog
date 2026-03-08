// src/components/ui/Button.tsx

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<string, string> = {
  primary: 'bg-green-600 active:bg-green-700 text-white',
  secondary: 'bg-orange-600 active:bg-orange-700 text-white',
  danger: 'bg-red-600 active:bg-red-700 text-white',
  ghost: 'bg-transparent active:bg-white/10 text-white',
  outline: 'bg-transparent border border-[#333] active:bg-white/5 text-white',
};

const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-2 text-sm min-h-[40px]',
  md: 'px-4 py-3 text-base min-h-[48px]',
  lg: 'px-5 py-3.5 text-lg min-h-[56px]',
  xl: 'px-6 py-4 text-xl min-h-[64px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        rounded-xl font-semibold transition-colors select-none
        flex items-center justify-center gap-2
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-40 pointer-events-none' : ''}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
