'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DomainInput, EmailInput, KeywordsInput } from '@/components/ui/form-inputs';
import { LocationSelector } from '@/components/ui/location-selector';
import { InvestmentSelector } from '@/components/ui/investment-selector';
import { AUSTRALIAN_LOCATIONS } from '@/lib/dataforseo';

interface FormData {
  domain: string;
  email: string;
  firstName?: string;
  phone?: string;
  company?: string;
  location: string;
  monthlySpend: number;
  investmentMonths: number;
  spendRange: string;
  durationRange: string;
  keywords: string[];
}

interface AnalysisProgress {
  step: string;
  message: string;
  percentage: number;
}

export default function AssessPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    domain: '',
    email: '',
    firstName: '',
    phone: '',
    company: '',
    location: '',
    monthlySpend: 0,
    investmentMonths: 0,
    spendRange: '',
    durationRange: '',
    keywords: []
  });

  const updateFormData = (updates: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Validate required fields
      if (!formData.domain || !formData.email || !formData.location || 
          !formData.spendRange || !formData.durationRange || 
          formData.keywords.length < 2) {
        throw new Error('Please complete all required fields');
      }

      console.log('Submitting analysis request...', formData);

      // Submit to analysis API
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      console.log('API Response:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Analysis failed');
      }

      if (!result.analysisId) {
        throw new Error('No analysis ID returned from server');
      }

      console.log('Starting analysis with ID:', result.analysisId);

      // Start showing progress screen with initial state
      setAnalysisId(result.analysisId);
      setAnalysisProgress({
        step: 'starting',
        message: 'Starting your SEO analysis...',
        percentage: 0
      });

      console.log('Loading screen should now be visible');

    } catch (err: any) {
      console.error('Form submission error:', err);
      setError(err.message || 'Failed to submit analysis. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Handle the case where user is redirected back from results with an ID
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if (id && !analysisProgress) {
      console.log('Found analysis ID in URL, showing loading screen:', id);
      setAnalysisId(id);
      setAnalysisProgress({
        step: 'resumed',
        message: 'Resuming analysis...',
        percentage: 50
      });
    }
  }, []);

  console.log('Current state:', { 
    analysisProgress, 
    analysisId, 
    isSubmitting, 
    currentStep 
  });

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to LinkScore',
      component: (
        <WelcomeStep 
          onNext={handleNext} 
        />
      ),
      canProceed: true
    },
    {
      id: 'domain',
      title: 'Your Website',
      component: (
        <DomainStep 
          value={formData.domain}
          onChange={(domain) => updateFormData({ domain })}
          onNext={handleNext}
          onPrevious={handlePrevious}
        />
      ),
      canProceed: formData.domain.length > 0
    },
    {
      id: 'email',
      title: 'Contact Information',
      component: (
        <EmailStep 
          email={formData.email}
          firstName={formData.firstName}
          onUpdate={(updates) => updateFormData(updates)}
          onNext={handleNext}
          onPrevious={handlePrevious}
        />
      ),
      canProceed: formData.email.length > 0
    },
    {
      id: 'location',
      title: 'Your Location',
      component: (
        <LocationStep 
          value={formData.location}
          onChange={(location) => updateFormData({ location })}
          onNext={handleNext}
          onPrevious={handlePrevious}
        />
      ),
      canProceed: formData.location.length > 0
    },
    {
      id: 'investment',
      title: 'SEO Investment',
      component: (
        <InvestmentStep 
          spendRange={formData.spendRange}
          durationRange={formData.durationRange}
          onUpdate={(updates) => updateFormData(updates)}
          onNext={handleNext}
          onPrevious={handlePrevious}
        />
      ),
      canProceed: formData.spendRange.length > 0 && formData.durationRange.length > 0
    },
    {
      id: 'keywords',
      title: 'Target Keywords',
      component: (
        <KeywordsStep 
          value={formData.keywords}
          onChange={(keywords) => updateFormData({ keywords })}
          onNext={handleSubmit}
          onPrevious={handlePrevious}
          isSubmitting={isSubmitting}
          error={error}
        />
      ),
      canProceed: formData.keywords.length >= 2
    }
  ];

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  if (analysisProgress) {
    console.log('Rendering loading screen with:', { analysisProgress, analysisId });
    return <AnalysisProgressScreen progress={analysisProgress} analysisId={analysisId} />;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container-mobile py-8">
        {/* Progress Header */}
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            LinkScore Assessment
          </h1>
          <p className="text-gray-600 mb-4">
            Step {currentStep + 1} of {steps.length}: {currentStepData.title}
          </p>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div 
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">
            {Math.round(progress)}% complete
          </p>
        </header>

        {/* Form Step */}
        <section className="bg-white rounded-2xl shadow-lg p-6">
          {currentStepData.component}
        </section>
      </div>
    </main>
  );
}

// Step Components
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center py-8">
      <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-10 h-10 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Keep Your SEO Provider Honest
      </h2>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        Find out if your link building investment is delivering results. 
        Get your LinkScore in under 2 minutes.
      </p>
      
      {/* Value Props */}
      <div className="grid gap-4 mb-8 max-w-sm mx-auto text-left">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-primary-600 rounded-full" />
          <span className="text-sm text-gray-700">Analyze your authority link profile</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-primary-600 rounded-full" />
          <span className="text-sm text-gray-700">Compare against competitors</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-primary-600 rounded-full" />
          <span className="text-sm text-gray-700">Identify missed opportunities</span>
        </div>
      </div>
      
      <button 
        onClick={onNext}
        className="btn-primary w-full h-12"
      >
        Start Assessment
      </button>
    </div>
  );
}

function DomainStep({ 
  value, 
  onChange, 
  onNext, 
  onPrevious 
}: { 
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <div className="py-6">
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        What's your website domain?
      </h3>
      <p className="text-gray-600 mb-6">
        We'll analyze your current link building performance
      </p>
      
      <DomainInput 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="yourdomain.com.au"
        className="mb-6"
      />
      
      <div className="flex gap-3">
        <button 
          onClick={onPrevious}
          className="btn-secondary flex-1"
        >
          Back
        </button>
        <button 
          onClick={onNext}
          disabled={!value}
          className="btn-primary flex-1"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function EmailStep({ 
  email,
  firstName,
  onUpdate, 
  onNext, 
  onPrevious 
}: { 
  email: string;
  firstName?: string;
  onUpdate: (updates: Partial<FormData>) => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <div className="py-6">
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        Where should we send your results?
      </h3>
      <p className="text-gray-600 mb-6">
        We'll email you a detailed analysis report
      </p>
      
      <div className="space-y-4 mb-6">
        <EmailInput 
          value={email}
          onChange={(e) => onUpdate({ email: e.target.value })}
          placeholder="your.email@company.com.au"
        />
        
        <input
          type="text"
          value={firstName || ''}
          onChange={(e) => onUpdate({ firstName: e.target.value })}
          placeholder="First name (optional)"
          className="input-field"
        />
      </div>
      
      <div className="flex gap-3">
        <button 
          onClick={onPrevious}
          className="btn-secondary flex-1"
        >
          Back
        </button>
        <button 
          onClick={onNext}
          disabled={!email}
          className="btn-primary flex-1"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function LocationStep({ 
  value, 
  onChange, 
  onNext, 
  onPrevious 
}: { 
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <div className="py-6">
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        Where is your business located?
      </h3>
      <p className="text-gray-600 mb-6">
        We'll find competitors in your local market
      </p>
      
      <LocationSelector 
        selectedLocation={value}
        onLocationSelect={onChange}
        onNext={onNext}
        className="mb-6"
      />
      
      <div className="flex gap-3">
        <button 
          onClick={onPrevious}
          className="btn-secondary flex-1"
        >
          Back
        </button>
      </div>
    </div>
  );
}

function InvestmentStep({ 
  spendRange,
  durationRange,
  onUpdate, 
  onNext, 
  onPrevious 
}: { 
  spendRange: string;
  durationRange: string;
  onUpdate: (updates: Partial<FormData>) => void;
  onNext: () => void;
  onPrevious: () => void;
}) {


  return (
    <div className="py-6">
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        Tell us about your SEO investment
      </h3>
      <p className="text-gray-600 mb-6">
        This helps us calculate if you're getting good value
      </p>
      
      <InvestmentSelector 
        data={{ spendRange, durationRange }}
        onUpdate={(data) => onUpdate({ 
          spendRange: data.spendRange || spendRange, 
          durationRange: data.durationRange || durationRange,
          monthlySpend: data.monthlySpend,
          investmentMonths: data.investmentMonths
        })}
        onNext={onNext}
        className="mb-6"
      />
      
      <div className="flex gap-3">
        <button 
          onClick={onPrevious}
          className="btn-secondary flex-1"
        >
          Back
        </button>
      </div>
    </div>
  );
}

function KeywordsStep({ 
  value,
  onChange, 
  onNext, 
  onPrevious,
  isSubmitting,
  error
}: { 
  value: string[];
  onChange: (value: string[]) => void;
  onNext: () => void;
  onPrevious: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  return (
    <div className="py-6">
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        What are your main target keywords?
      </h3>
      <p className="text-gray-600 mb-6">
        List 2-5 keywords you're trying to rank for
      </p>
      
      <KeywordsInput 
        keywords={value}
        onKeywordsChange={onChange}
        placeholder="e.g., personal injury lawyer sydney"
        maxKeywords={5}
        className="mb-6"
      />
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
      
      <div className="flex gap-3">
        <button 
          onClick={onPrevious}
          disabled={isSubmitting}
          className="btn-secondary flex-1"
        >
          Back
        </button>
        <button 
          onClick={onNext}
          disabled={value.length < 2 || isSubmitting}
          className="btn-primary flex-1"
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyzing...
            </div>
          ) : (
            'Get My LinkScore'
          )}
        </button>
      </div>
    </div>
  );
}

function AnalysisProgressScreen({ progress, analysisId }: { progress: AnalysisProgress, analysisId: string | null }) {
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    message: string;
    icon: string;
    timestamp: Date;
    personalized?: boolean;
    data?: any;
  }>>([]);
  const [currentProgress, setCurrentProgress] = useState(progress);
  const [isComplete, setIsComplete] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  console.log('AnalysisProgressScreen mounted with:', { progress, analysisId });

  // Add notification helper
  const addNotification = (message: string, icon: string, personalized = false, data?: any) => {
    console.log('Adding notification:', { message, icon, personalized, data });
    setNotifications(prev => [...prev, {
      id: `notification-${Date.now()}-${Math.random()}`,
      message,
      icon,
      timestamp: new Date(),
      personalized,
      data
    }]);
  };

  // Handle cancel analysis
  const handleCancelAnalysis = async () => {
    if (!analysisId || isCancelling) return;

    setIsCancelling(true);
    console.log('Cancelling analysis:', analysisId);

    try {
      const response = await fetch(`/api/analyze/${analysisId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();

      if (response.ok) {
        console.log('Analysis cancelled successfully:', result);
        addNotification('Analysis cancelled successfully', '✋', false);
        
        // Redirect to home page after a short delay
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        console.error('Failed to cancel analysis:', result);
        addNotification('Failed to cancel analysis', '❌', false);
        setIsCancelling(false);
      }
    } catch (error) {
      console.error('Error cancelling analysis:', error);
      addNotification('Error cancelling analysis', '❌', false);
      setIsCancelling(false);
    }
  };

  // Poll for status updates
  useEffect(() => {
    if (!analysisId) {
      console.warn('No analysis ID provided to AnalysisProgressScreen');
      return;
    }

    console.log('Starting status polling for analysis:', analysisId);

    const pollInterval = setInterval(async () => {
      try {
        console.log('Polling status for:', analysisId);
        const response = await fetch(`/api/analyze/${analysisId}/status`);
        const data = await response.json();
        
        console.log('Status response:', data);
        
        if (data.status === 'completed') {
          console.log('Analysis completed, redirecting to results');
          setIsComplete(true);
          clearInterval(pollInterval);
          
          // Add completion notification
          addNotification(
            'Analysis complete! Preparing your personalized results...', 
            '🎉', 
            true
          );
          
          // Redirect to results after a short delay
          setTimeout(() => {
            console.log('Redirecting to results page');
            window.location.href = `/results/${analysisId}`;
          }, 2000);
          
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          console.log('Analysis failed or cancelled:', data);
          clearInterval(pollInterval);
          
          if (data.status === 'cancelled') {
            addNotification('Analysis was cancelled', '✋', false);
          } else {
            addNotification(
              data.error || 'Analysis failed. Please try again.', 
              '❌'
            );
          }
        } else if (data.progress) {
          console.log('Progress update:', data.progress);
          // Update current progress
          setCurrentProgress({
            step: data.progress.step,
            message: data.progress.message,
            percentage: data.progress.percentage
          });

          // Add notification for this progress update if it's new
          if (data.progress.message && data.progress.step) {
            addNotification(
              data.progress.message,
              getProgressIcon(data.progress.step),
              data.progress.personalized,
              data.progress.data
            );
          }
        }
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    }, 2000); // Poll every 2 seconds for more responsive updates

    return () => {
      console.log('Cleaning up status polling');
      clearInterval(pollInterval);
    };
  }, [analysisId]);

  // Get appropriate icon for progress step
  const getProgressIcon = (step: string): string => {
    const icons: Record<string, string> = {
      'competitors': '🔍',
      'competitors_found': '🏢',
      'client_analysis': '🔗',
      'client_analysis_complete': '✅',
      'competitor_analysis': '⚡',
      'competitor_result': '📊',
      'competitors_ranked': '🏆',
      'link_gaps': '🎯',
      'link_gaps_found': '🔗',
      'scoring': '🧮',
      'scoring_complete': '🎉',
      'completed': '✨',
      'failed': '❌'
    };
    return icons[step] || '⚡';
  };

  // Enhanced notification rendering with data display
  const renderNotification = (notification: any) => {
    const hasMetrics = notification.data?.metrics;
    const hasCompetitors = notification.data?.competitors?.length > 0;
    const hasKeywords = notification.data?.keywords?.length > 0;

    return (
      <div 
        key={notification.id}
        className={`flex items-start gap-3 p-4 rounded-lg transition-all duration-300 animate-fadeIn ${
          notification.personalized 
            ? 'bg-primary-50 border border-primary-200' 
            : 'bg-gray-50'
        }`}
      >
        <span className="text-lg flex-shrink-0 mt-0.5">
          {notification.icon}
        </span>
        <div className="flex-1">
          <p className="text-sm text-gray-800 font-medium mb-1">
            {notification.message}
          </p>

          {/* Show dynamic data if available */}
          {notification.data && (
            <div className="space-y-2">
              {/* Keywords */}
              {hasKeywords && (
                <div className="flex flex-wrap gap-1">
                  {notification.data.keywords.map((keyword: string, index: number) => (
                    <span 
                      key={index}
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full"
                    >
                      "{keyword}"
                    </span>
                  ))}
                </div>
              )}

              {/* Competitors */}
              {hasCompetitors && (
                <div className="flex flex-wrap gap-1">
                  {notification.data.competitors.slice(0, 3).map((competitor: string, index: number) => (
                    <span 
                      key={index}
                      className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full"
                    >
                      {competitor}
                    </span>
                  ))}
                  {notification.data.competitors.length > 3 && (
                    <span className="text-xs text-gray-500">
                      +{notification.data.competitors.length - 3} more
                    </span>
                  )}
                </div>
              )}

              {/* Metrics */}
              {hasMetrics && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(notification.data.metrics).map(([key, value]: [string, any]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-600 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                      </span>
                      <span className="font-medium">
                        {typeof value === 'number' ? value.toLocaleString() : value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Current activity */}
              {notification.data.currentActivity && (
                <p className="text-xs text-gray-600 italic">
                  {notification.data.currentActivity}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500 mt-2">
            {notification.timestamp.toLocaleTimeString()}
          </p>
        </div>
        {notification.personalized && (
          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full font-medium">
            Live
          </span>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container-mobile py-8">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6 relative">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              {currentProgress.percentage > 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-600">
                    {Math.round(currentProgress.percentage)}%
                  </span>
                </div>
              )}
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {isComplete ? 'Analysis Complete!' : 'Analyzing Your SEO'}
            </h2>
            <p className="text-gray-600 mb-8">
              {isComplete ? 'Preparing your personalized results...' : 'This usually takes 1-2 minutes'}
            </p>
            
            {/* Progress Bar */}
            <div className="bg-gray-100 rounded-full h-3 mb-4 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-primary-500 to-primary-600 h-3 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${currentProgress.percentage}%` }}
              />
            </div>
            
            <p className="text-sm text-gray-600 font-medium">
              {currentProgress.message}
            </p>
          </div>

          {/* Live Notifications */}
          {notifications.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Live Analysis Updates
              </h3>
              
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {notifications.slice(-8).reverse().map(renderNotification)}
              </div>
            </div>
          )}

          {/* Analysis Tips */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              💡 What we're analyzing
            </h3>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>Your backlink profile against top competitors in your location</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>Quality authority links (Domain Rank 20+, low spam score)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>Link gaps where competitors have authority links but you don't</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>ROI calculation based on $667 benchmark per authority link</span>
              </div>
            </div>
          </div>

          {/* Cancel Option */}
          {!isComplete && (
            <div className="mt-8 text-center">
              <button 
                onClick={handleCancelAnalysis}
                disabled={isCancelling}
                className="text-gray-500 text-sm hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCancelling ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Cancelling Analysis...
                  </div>
                ) : (
                  'Cancel Analysis'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
      );
  }

// Add fadeIn animation to globals.css
// @keyframes fadeIn {
//   from { opacity: 0; transform: translateY(10px); }
//   to { opacity: 1; transform: translateY(0); }
// }
// .animate-fadeIn {
//   animation: fadeIn 0.3s ease-out;
// } 