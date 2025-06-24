'use client';

import { useState } from 'react';

// Investment ranges from PRD
const SPEND_RANGES = [
  { value: '1000-2000', label: '$1,000 to $2,000/month', midpoint: 1500 },
  { value: '2000-4000', label: '$2,000 to $4,000/month', midpoint: 3000 },
  { value: '4000-6000', label: '$4,000 to $6,000/month', midpoint: 5000 },
  { value: '6000-10000', label: '$6,000 to $10,000/month', midpoint: 8000 },
  { value: '10000+', label: '$10,000+/month', midpoint: 12000 }
];

const DURATION_RANGES = [
  { value: '6-12', label: '6-12 months ago', midpoint: 9 },
  { value: '12-24', label: '1-2 years ago', midpoint: 18 },
  { value: '24+', label: 'More than 2 years ago', midpoint: 30 }
];

interface InvestmentData {
  spendRange?: string;
  durationRange?: string;
  monthlySpend?: number;
  investmentMonths?: number;
}

interface InvestmentSelectorProps {
  data: InvestmentData;
  onUpdate: (data: InvestmentData) => void;
  onNext: () => void;
  className?: string;
}

export function InvestmentSelector({ data, onUpdate, onNext, className = '' }: InvestmentSelectorProps) {
  const [spendRange, setSpendRange] = useState(data.spendRange || '');
  const [durationRange, setDurationRange] = useState(data.durationRange || '');

  const handleSpendSelect = (range: typeof SPEND_RANGES[0]) => {
    setSpendRange(range.value);
    onUpdate({
      ...data,
      spendRange: range.value,
      monthlySpend: range.midpoint
    });
  };

  const handleDurationSelect = (range: typeof DURATION_RANGES[0]) => {
    setDurationRange(range.value);
    onUpdate({
      ...data,
      durationRange: range.value,
      investmentMonths: range.midpoint
    });
  };

  const handleContinue = () => {
    const selectedSpend = SPEND_RANGES.find(s => s.value === spendRange);
    const selectedDuration = DURATION_RANGES.find(d => d.value === durationRange);
    
    onUpdate({ 
      ...data, 
      monthlySpend: selectedSpend?.midpoint,
      investmentMonths: selectedDuration?.midpoint,
      spendRange,
      durationRange
    });
    onNext();
  };

  return (
    <div className={`investment-selector ${className}`}>
      {/* Monthly Spend Section */}
      <div className="mb-8">
        <label className="form-label text-lg font-medium mb-4 block">
          Monthly SEO Investment
        </label>
        <p className="text-sm text-gray-600 mb-4">
          <strong>Be accurate!</strong> We calculate how many authority links you should have and your ROI based on this amount. Include all SEO costs (agency fees, tools, content, etc.).
        </p>
        <div className="grid gap-3">
          {SPEND_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => handleSpendSelect(range)}
              className={`range-card p-4 rounded-xl border-2 text-left transition-all duration-200 touch-manipulation ${
                spendRange === range.value
                  ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{range.label}</span>
                {spendRange === range.value && (
                  <div className="w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Duration Section */}
      <div className="mb-8">
        <label className="form-label text-lg font-medium mb-4 block">
          When did you start SEO?
        </label>
        <p className="text-sm text-gray-600 mb-4">
          How long have you been investing in SEO services?
        </p>
        <div className="grid gap-3">
          {DURATION_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => handleDurationSelect(range)}
              className={`range-card p-4 rounded-xl border-2 text-left transition-all duration-200 touch-manipulation ${
                durationRange === range.value
                  ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{range.label}</span>
                {durationRange === range.value && (
                  <div className="w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Continue Button */}
      <button
        onClick={handleContinue}
        disabled={!spendRange || !durationRange}
        className={`w-full h-12 font-semibold rounded-lg transition-all duration-200 touch-manipulation ${
          spendRange && durationRange
            ? 'btn-primary'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        Continue
      </button>
      
      {(!spendRange || !durationRange) && (
        <p className="text-sm text-gray-500 text-center mt-2">
          Please select both options to continue
        </p>
      )}
    </div>
  );
}

// Export ranges for use in other components
export { SPEND_RANGES, DURATION_RANGES }; 