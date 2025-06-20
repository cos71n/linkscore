'use client';

import { ReactNode } from 'react';

// Main mobile container with safe areas
interface MobileContainerProps {
  children: ReactNode;
  className?: string;
  withSafeArea?: boolean;
}

export function MobileContainer({ 
  children, 
  className = '', 
  withSafeArea = true 
}: MobileContainerProps) {
  return (
    <div className={`container-mobile ${withSafeArea ? 'pt-safe pb-safe' : ''} ${className}`}>
      {children}
    </div>
  );
}

// Mobile page wrapper with consistent padding and structure
interface MobilePageProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  headerClassName?: string;
}

export function MobilePage({ 
  children, 
  title, 
  subtitle, 
  className = '',
  headerClassName = ''
}: MobilePageProps) {
  return (
    <main className={`min-h-screen bg-gray-50 ${className}`}>
      <MobileContainer className="py-8">
        {(title || subtitle) && (
          <header className={`text-center mb-8 ${headerClassName}`}>
            {title && (
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-gray-600">
                {subtitle}
              </p>
            )}
          </header>
        )}
        {children}
      </MobileContainer>
    </main>
  );
}

// Mobile card component for consistent content containers
interface MobileCardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  noPadding?: boolean;
}

export function MobileCard({ 
  children, 
  className = '', 
  padding = 'md',
  noPadding = false
}: MobileCardProps) {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  };

  return (
    <div className={`bg-white rounded-2xl shadow-lg ${noPadding ? '' : paddingClasses[padding]} ${className}`}>
      {children}
    </div>
  );
}

// Section divider for mobile layouts
interface MobileSectionProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  spacing?: 'sm' | 'md' | 'lg';
}

export function MobileSection({ 
  children, 
  title, 
  subtitle, 
  className = '',
  spacing = 'md'
}: MobileSectionProps) {
  const spacingClasses = {
    sm: 'mb-4',
    md: 'mb-6',
    lg: 'mb-8'
  };

  return (
    <section className={`${spacingClasses[spacing]} ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-sm text-gray-600">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

// Mobile-first button group
interface MobileButtonGroupProps {
  children: ReactNode;
  direction?: 'vertical' | 'horizontal';
  className?: string;
}

export function MobileButtonGroup({ 
  children, 
  direction = 'vertical', 
  className = '' 
}: MobileButtonGroupProps) {
  const directionClasses = {
    vertical: 'flex flex-col gap-3',
    horizontal: 'flex gap-3'
  };

  return (
    <div className={`${directionClasses[direction]} ${className}`}>
      {children}
    </div>
  );
}

// Loading skeleton for mobile components
interface MobileSkeletonProps {
  className?: string;
  lines?: number;
  avatar?: boolean;
}

export function MobileSkeleton({ 
  className = '', 
  lines = 3, 
  avatar = false 
}: MobileSkeletonProps) {
  return (
    <div className={`animate-pulse ${className}`}>
      {avatar && (
        <div className="w-12 h-12 bg-gray-200 rounded-full mb-4"></div>
      )}
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={`h-4 bg-gray-200 rounded ${
              index === lines - 1 ? 'w-3/4' : 'w-full'
            }`}
          ></div>
        ))}
      </div>
    </div>
  );
}

// Mobile sticky footer for CTAs
interface MobileStickyFooterProps {
  children: ReactNode;
  className?: string;
  show?: boolean;
}

export function MobileStickyFooter({ 
  children, 
  className = '', 
  show = true 
}: MobileStickyFooterProps) {
  if (!show) return null;

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-safe z-40 ${className}`}>
      {children}
    </div>
  );
}

// Mobile grid for equal-width items
interface MobileGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MobileGrid({ 
  children, 
  columns = 2, 
  gap = 'md', 
  className = '' 
}: MobileGridProps) {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3'
  };

  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4'
  };

  return (
    <div className={`grid ${columnClasses[columns]} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
}

// Mobile status indicator
interface MobileStatusProps {
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  className?: string;
}

export function MobileStatus({ status, message, className = '' }: MobileStatusProps) {
  const statusStyles = {
    success: 'bg-green-50 text-green-800 border-green-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200'
  };

  const icons = {
    success: '✓',
    warning: '⚠',
    error: '✕',
    info: 'ℹ'
  };

  return (
    <div className={`flex items-center p-3 rounded-lg border ${statusStyles[status]} ${className}`}>
      <span className="mr-2 font-semibold">{icons[status]}</span>
      <span className="text-sm">{message}</span>
    </div>
  );
}

// Mobile progress bar
interface MobileProgressProps {
  progress: number; // 0-100
  className?: string;
  showPercentage?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'error';
}

export function MobileProgress({ 
  progress, 
  className = '', 
  showPercentage = false,
  color = 'primary'
}: MobileProgressProps) {
  const colorClasses = {
    primary: 'bg-primary-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    error: 'bg-red-600'
  };

  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={`w-full ${className}`}>
      {showPercentage && (
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Progress</span>
          <span>{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ease-out ${colorClasses[color]}`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
} 