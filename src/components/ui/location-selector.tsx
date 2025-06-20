'use client';

import { useState } from 'react';
import { MapPinIcon } from '@heroicons/react/24/outline';

// Australian locations from PRD with DataForSEO codes
const AUSTRALIAN_LOCATIONS = {
  "sydney": { 
    code: 21167, 
    name: "Sydney, NSW", 
    displayName: "Sydney",
    population: "5.4M",
    marketValue: "HIGH"
  },
  "melbourne": { 
    code: 21173, 
    name: "Melbourne, VIC", 
    displayName: "Melbourne",
    population: "5.3M",
    marketValue: "HIGH"
  },
  "brisbane": { 
    code: 21174, 
    name: "Brisbane, QLD", 
    displayName: "Brisbane",
    population: "2.5M",
    marketValue: "HIGH"
  },
  "perth": { 
    code: 21175, 
    name: "Perth, WA", 
    displayName: "Perth",
    population: "2.1M",
    marketValue: "HIGH"
  },
  "adelaide": { 
    code: 21176, 
    name: "Adelaide, SA", 
    displayName: "Adelaide",
    population: "1.3M",
    marketValue: "MEDIUM"
  },
  "gold_coast": { 
    code: 1011678, 
    name: "Gold Coast, QLD", 
    displayName: "Gold Coast",
    population: "750K",
    marketValue: "MEDIUM"
  },
  "newcastle": { 
    code: 1011715, 
    name: "Newcastle, NSW", 
    displayName: "Newcastle",
    population: "308K",
    marketValue: "MEDIUM"
  },
  "canberra": { 
    code: 21177, 
    name: "Canberra, ACT", 
    displayName: "Canberra",
    population: "368K",
    marketValue: "MEDIUM"
  },
  "sunshine_coast": { 
    code: 1011679, 
    name: "Sunshine Coast, QLD", 
    displayName: "Sunshine Coast",
    population: "350K",
    marketValue: "MEDIUM"
  },
  "wollongong": { 
    code: 1011717, 
    name: "Wollongong, NSW", 
    displayName: "Wollongong",
    population: "292K",
    marketValue: "MEDIUM"
  },
  "central_coast": { 
    code: 1011716, 
    name: "Central Coast, NSW", 
    displayName: "Central Coast",
    population: "340K",
    marketValue: "MEDIUM"
  },
  "australia_general": { 
    code: 2036, 
    name: "Australia", 
    displayName: "Other/General",
    population: "Other",
    marketValue: "VARIABLE"
  }
};

interface LocationSelectorProps {
  selectedLocation: string;
  onLocationSelect: (location: string) => void;
  onNext: () => void;
  className?: string;
}

export function LocationSelector({ 
  selectedLocation, 
  onLocationSelect, 
  onNext, 
  className = '' 
}: LocationSelectorProps) {
  const [selection, setSelection] = useState(selectedLocation);

  const handleLocationSelect = (locationKey: string) => {
    setSelection(locationKey);
    onLocationSelect(locationKey);
  };

  const handleContinue = () => {
    if (selection) {
      onNext();
    }
  };

  // Group locations for better mobile display
  const majorCities = ['sydney', 'melbourne', 'brisbane', 'perth'];
  const otherCities = Object.keys(AUSTRALIAN_LOCATIONS).filter(
    key => !majorCities.includes(key) && key !== 'australia_general'
  );

  return (
    <div className={`location-selector ${className}`}>
      <div className="mb-6">
        <label className="form-label text-lg font-medium mb-4 block">
          Where is your business located?
        </label>
        <p className="text-sm text-gray-600 mb-4">
          This helps us find your local competitors and search patterns
        </p>
      </div>

      {/* Major Cities */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Major Cities</h3>
        <div className="grid grid-cols-2 gap-3">
          {majorCities.map((locationKey) => {
            const location = AUSTRALIAN_LOCATIONS[locationKey as keyof typeof AUSTRALIAN_LOCATIONS];
            return (
              <button
                key={locationKey}
                onClick={() => handleLocationSelect(locationKey)}
                className={`location-card p-4 rounded-xl border-2 text-left transition-all duration-200 touch-manipulation ${
                  selection === locationKey
                    ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{location.displayName}</div>
                    <div className="text-xs text-gray-500 mt-1">{location.population}</div>
                  </div>
                  {selection === locationKey && (
                    <div className="w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Other Cities */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Other Cities</h3>
        <div className="grid gap-2">
          {otherCities.map((locationKey) => {
            const location = AUSTRALIAN_LOCATIONS[locationKey as keyof typeof AUSTRALIAN_LOCATIONS];
            return (
              <button
                key={locationKey}
                onClick={() => handleLocationSelect(locationKey)}
                className={`location-card p-3 rounded-lg border-2 text-left transition-all duration-200 touch-manipulation ${
                  selection === locationKey
                    ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <MapPinIcon className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                    <div>
                      <span className="font-medium text-gray-900">{location.displayName}</span>
                      <span className="text-xs text-gray-500 ml-2">({location.population})</span>
                    </div>
                  </div>
                  {selection === locationKey && (
                    <div className="w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* General Option */}
      <div className="mb-8">
        <button
          onClick={() => handleLocationSelect('australia_general')}
          className={`location-card w-full p-3 rounded-lg border-2 text-left transition-all duration-200 touch-manipulation ${
            selection === 'australia_general'
              ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <MapPinIcon className="w-4 h-4 text-gray-400 mr-2" />
              <span className="font-medium text-gray-900">
                {AUSTRALIAN_LOCATIONS.australia_general.displayName}
              </span>
            </div>
            {selection === 'australia_general' && (
              <div className="w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
        </button>
      </div>

      {/* Continue Button */}
      <button
        onClick={handleContinue}
        disabled={!selection}
        className={`w-full h-12 font-semibold rounded-lg transition-all duration-200 touch-manipulation ${
          selection
            ? 'btn-primary'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        Continue
      </button>
      
      {!selection && (
        <p className="text-sm text-gray-500 text-center mt-2">
          Please select your location to continue
        </p>
      )}
    </div>
  );
}

// Export locations for use in other components
export { AUSTRALIAN_LOCATIONS }; 