import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const variants = {
  primary: 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white',
  secondary: 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700',
  danger: 'bg-red-500 hover:bg-red-600 active:bg-red-700 text-white',
  ghost: 'hover:bg-gray-100 active:bg-gray-200 text-gray-700',
  outline: 'border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700',
  success: 'bg-green-500 hover:bg-green-600 active:bg-green-700 text-white'
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg',
  icon: 'p-2'
};

export default function LoadingButton({ 
  onClick, 
  loading: externalLoading,
  disabled, 
  children, 
  variant = 'primary',
  size = 'md',
  className = '',
  loadingText = 'Loading...',
  preventDoubleClick = true,
  ...props
}) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = externalLoading || internalLoading;

  const handleClick = async (e) => {
    if (disabled || isLoading) return;
    
    if (preventDoubleClick) {
      setInternalLoading(true);
    }
    
    try {
      await onClick?.(e);
    } finally {
      if (preventDoubleClick) {
        // Small delay to prevent rapid re-clicks
        setTimeout(() => setInternalLoading(false), 300);
      }
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={cn(
        'rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2',
        variants[variant],
        sizes[size],
        (disabled || isLoading) && 'opacity-50 cursor-not-allowed',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {size !== 'icon' && <span>{loadingText}</span>}
        </>
      ) : (
        children
      )}
    </button>
  );
}

// Wrapper for existing Button component with loading state
export function withLoading(WrappedButton) {
  return function LoadingWrapper({ loading, loadingText = 'Loading...', children, ...props }) {
    return (
      <WrappedButton disabled={loading || props.disabled} {...props}>
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            {loadingText}
          </>
        ) : (
          children
        )}
      </WrappedButton>
    );
  };
}