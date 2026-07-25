import React from 'react';
import clsx from 'clsx';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helpText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helpText, className, children, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            {label}
            {props.required && <span className="text-danger ml-1">*</span>}
          </label>
        )}
        <select
          ref={ref}
          className={clsx(
            'w-full px-4 py-2 border rounded-md text-base bg-white transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
            'disabled:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-500',
            error
              ? 'border-danger focus:ring-danger'
              : 'border-neutral-300 hover:border-neutral-400',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        {helpText && !error && <p className="mt-1 text-sm text-neutral-500">{helpText}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
