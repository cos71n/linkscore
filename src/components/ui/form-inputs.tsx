'use client';

import { useState, forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

// Base input component with mobile optimizations
interface BaseInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label?: string;
  error?: string;
  helpText?: string;
  className?: string;
  containerClassName?: string;
}

export const MobileInput = forwardRef<HTMLInputElement, BaseInputProps>(
  ({ label, error, helpText, className = '', containerClassName = '', ...props }, ref) => {
    return (
      <div className={`mobile-input-container ${containerClassName}`}>
        {label && (
          <label className="form-label" htmlFor={props.id}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`form-input ${error ? 'border-red-300 focus:ring-red-500' : ''} ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {helpText && !error && (
          <p className="mt-1 text-sm text-gray-500">
            {helpText}
          </p>
        )}
      </div>
    );
  }
);
MobileInput.displayName = 'MobileInput';

// Domain input with specific validation styling
interface DomainInputProps extends BaseInputProps {
  onValidate?: (isValid: boolean) => void;
}

export const DomainInput = forwardRef<HTMLInputElement, DomainInputProps>(
  ({ onValidate, ...props }, ref) => {
    const [isValid, setIsValid] = useState(true);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const isValidDomain = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.?[a-zA-Z]{2,}$/.test(value);
      setIsValid(isValidDomain || value === '');
      onValidate?.(isValidDomain);
      props.onChange?.(e);
    };

    return (
      <MobileInput
        ref={ref}
        type="text"
        placeholder="yourwebsite.com.au"
        autoComplete="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        className={`${!isValid ? 'border-red-300 focus:ring-red-500' : ''}`}
        onChange={handleChange}
        {...props}
      />
    );
  }
);
DomainInput.displayName = 'DomainInput';

// Email input with mobile optimizations
export const EmailInput = forwardRef<HTMLInputElement, BaseInputProps>(
  (props, ref) => {
    return (
      <MobileInput
        ref={ref}
        type="email"
        placeholder="your@email.com"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        {...props}
      />
    );
  }
);
EmailInput.displayName = 'EmailInput';

// Phone input with Australian formatting
export const PhoneInput = forwardRef<HTMLInputElement, BaseInputProps>(
  (props, ref) => {
    const [formattedValue, setFormattedValue] = useState('');

    const formatPhoneNumber = (value: string) => {
      // Remove all non-digits
      const digits = value.replace(/\D/g, '');
      
      // Format as Australian phone number
      if (digits.length >= 10) {
        return digits.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
      } else if (digits.length >= 7) {
        return digits.replace(/(\d{4})(\d{3})/, '$1 $2');
      } else if (digits.length >= 4) {
        return digits.replace(/(\d{4})/, '$1');
      }
      return digits;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatPhoneNumber(e.target.value);
      setFormattedValue(formatted);
      
      // Create a new event with the formatted value
      const newEvent = {
        ...e,
        target: {
          ...e.target,
          value: formatted
        }
      };
      props.onChange?.(newEvent as React.ChangeEvent<HTMLInputElement>);
    };

    return (
      <MobileInput
        ref={ref}
        type="tel"
        placeholder="0400 000 000"
        autoComplete="tel"
        value={formattedValue}
        onChange={handleChange}
        {...props}
      />
    );
  }
);
PhoneInput.displayName = 'PhoneInput';

// Password input with toggle visibility
export const PasswordInput = forwardRef<HTMLInputElement, BaseInputProps>(
  ({ className = '', ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="relative">
        <MobileInput
          ref={ref}
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          className={`pr-12 ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 touch-manipulation"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <EyeSlashIcon className="w-5 h-5" />
          ) : (
            <EyeIcon className="w-5 h-5" />
          )}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';

// Textarea with mobile optimizations
interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  label?: string;
  error?: string;
  helpText?: string;
  className?: string;
  containerClassName?: string;
}

export const MobileTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helpText, className = '', containerClassName = '', ...props }, ref) => {
    return (
      <div className={`mobile-textarea-container ${containerClassName}`}>
        {label && (
          <label className="form-label" htmlFor={props.id}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`form-input resize-none ${error ? 'border-red-300 focus:ring-red-500' : ''} ${className}`}
          rows={3}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {helpText && !error && (
          <p className="mt-1 text-sm text-gray-500">
            {helpText}
          </p>
        )}
      </div>
    );
  }
);
MobileTextarea.displayName = 'MobileTextarea';

// Keywords input with tag-like display
interface KeywordsInputProps {
  keywords: string[];
  onKeywordsChange: (keywords: string[]) => void;
  placeholder?: string;
  maxKeywords?: number;
  className?: string;
}

export function KeywordsInput({ 
  keywords, 
  onKeywordsChange, 
  placeholder = "Enter keywords separated by commas",
  maxKeywords = 5,
  className = ''
}: KeywordsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Auto-add keyword when comma is typed
    if (value.includes(',') && keywords.length < maxKeywords) {
      const newKeywords = value.split(',').map(k => k.trim()).filter(k => k);
      const uniqueKeywords = [...new Set([...keywords, ...newKeywords])].slice(0, maxKeywords);
      onKeywordsChange(uniqueKeywords);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim() && keywords.length < maxKeywords) {
      e.preventDefault();
      const newKeyword = inputValue.trim();
      if (!keywords.includes(newKeyword)) {
        onKeywordsChange([...keywords, newKeyword]);
      }
      setInputValue('');
    }
  };

  const removeKeyword = (indexToRemove: number) => {
    onKeywordsChange(keywords.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className={`keywords-input ${className}`}>
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {keywords.map((keyword, index) => (
            <span
              key={index}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800"
            >
              {keyword}
              <button
                type="button"
                onClick={() => removeKeyword(index)}
                className="ml-2 text-primary-600 hover:text-primary-800 touch-manipulation"
                aria-label={`Remove ${keyword}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <MobileInput
        type="text"
        placeholder={keywords.length >= maxKeywords ? `Maximum ${maxKeywords} keywords` : placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        disabled={keywords.length >= maxKeywords}
        helpText={`${keywords.length}/${maxKeywords} keywords added. Press Enter or use commas to add keywords.`}
      />
    </div>
  );
} 