'use client';

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

// Australian locations from PRD
const AUSTRALIAN_LOCATIONS = [
  { value: "sydney", name: "Sydney, NSW", population: "5.4M" },
  { value: "melbourne", name: "Melbourne, VIC", population: "5.3M" },
  { value: "brisbane", name: "Brisbane, QLD", population: "2.5M" },
  { value: "perth", name: "Perth, WA", population: "2.1M" },
  { value: "adelaide", name: "Adelaide, SA", population: "1.3M" },
  { value: "gold_coast", name: "Gold Coast, QLD", population: "750K" },
  { value: "newcastle", name: "Newcastle, NSW", population: "308K" },
  { value: "canberra", name: "Canberra, ACT", population: "368K" },
  { value: "sunshine_coast", name: "Sunshine Coast, QLD", population: "350K" },
  { value: "wollongong", name: "Wollongong, NSW", population: "292K" },
  { value: "central_coast", name: "Central Coast, NSW", population: "340K" },
  { value: "australia_general", name: "Other/General", population: "Other" }
];

// Investment ranges from PRD
const SPEND_RANGES = [
  { value: '1000-2000', label: '$1,000 to $2,000/month' },
  { value: '2000-4000', label: '$2,000 to $4,000/month' },
  { value: '4000-6000', label: '$4,000 to $6,000/month' },
  { value: '6000-10000', label: '$6,000 to $10,000/month' },
  { value: '10000+', label: '$10,000+/month' }
];

const DURATION_RANGES = [
  { value: '6-12', label: '6-12 months ago' },
  { value: '12-24', label: '1-2 years ago' },
  { value: '24+', label: 'More than 2 years ago' }
];

export default function HomePage() {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(1);
  const [formData, setFormData] = React.useState({
    domain: '',
    email: '',
    location: '',
    spendRange: '',
    durationRange: '',
    keywords: ''
  });

  const totalSteps = 5;

  // Capture Facebook Click ID for attribution tracking
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const fbclid = urlParams.get('fbclid');
    
    if (fbclid) {
      console.log('📊 Facebook Click ID captured:', fbclid.substring(0, 20) + '...');
      localStorage.setItem('fbclid', fbclid);
      
      // Optional: Clean URL to remove fbclid parameter for better UX
      const url = new URL(window.location.href);
      url.searchParams.delete('fbclid');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Domain sanitization function
  const sanitizeDomain = (input: string): string => {
    let domain = input.trim();
    
    // Remove protocols
    domain = domain.replace(/^https?:\/\//, '');
    
    // Remove www.
    domain = domain.replace(/^www\./, '');
    
    // Remove trailing slash and any path
    domain = domain.split('/')[0];
    
    // Remove query parameters and fragments
    domain = domain.split('?')[0].split('#')[0];
    
    return domain;
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Convert comma-separated keywords to array
      const keywordsArray = formData.keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      // Get Facebook attribution data
      const fbclid = localStorage.getItem('fbclid');
      
      // Get Facebook Browser ID from cookie (set by Facebook Pixel)
      const getFacebookBrowserId = (): string | null => {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === '_fbp') {
            return value;
          }
        }
        return null;
      };
      
      const fbp = getFacebookBrowserId();
      
      // Prepare submission data in the format our API expects
      const submissionData = {
        domain: formData.domain,
        email: formData.email,
        firstName: '', // We don't collect first name in this form
        company: '', // We don't collect company in this form
        location: formData.location,
        keywords: keywordsArray,
        monthlySpend: getMonthlySpendFromRange(formData.spendRange),
        investmentMonths: getInvestmentMonthsFromRange(formData.durationRange),
        spendRange: formData.spendRange,
        durationRange: formData.durationRange,
        // Facebook attribution data
        facebookClickId: fbclid,
        facebookBrowserId: fbp
      };

      console.log('Submitting to API:', submissionData);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData),
      });

      const result = await response.json();

      if (response.ok) {
        console.log('Analysis started:', result);
        setIsDialogOpen(false);
        // Redirect to results page with analysis ID
        window.location.href = `/results/${result.analysisId}`;
      } else {
        console.error('API error:', result);
        setSubmitError(result.error || 'Analysis failed. Please try again.');
      }
    } catch (error) {
      console.error('Submission error:', error);
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper functions to convert range strings to numbers
  const getMonthlySpendFromRange = (range: string): number => {
    switch (range) {
      case '1000-2000': return 1500; // Midpoint
      case '2000-4000': return 3000;
      case '4000-6000': return 5000;
      case '6000-10000': return 8000;
      case '10000+': return 12000;
      default: return 1000;
    }
  };

  const getInvestmentMonthsFromRange = (range: string): number => {
    switch (range) {
      case '6-12': return 9; // Midpoint
      case '12-24': return 18;
      case '24+': return 36;
      default: return 12;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return formData.domain && formData.email;
      case 2: return formData.location;
      case 3: return formData.spendRange;
      case 4: return formData.durationRange;
      case 5: return formData.keywords && formData.keywords.split(',').length >= 1;
      default: return false;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return "Website & Contact";
      case 2: return "Your Location";
      case 3: return "Monthly SEO Spend";
      case 4: return "When did you start SEO?";
      case 5: return "Target Keywords";
      default: return "";
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Website Domain</Label>
              <Input
                placeholder="yourwebsite.com.au"
                value={formData.domain}
                onChange={(e) => {
                  const sanitizedDomain = sanitizeDomain(e.target.value);
                  setFormData({...formData, domain: sanitizedDomain});
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
          </div>
        );

             case 2:
         return (
           <div className="space-y-6">
             <p className="text-sm text-muted-foreground">
               This helps us find your local competitors
             </p>
             
             {/* Major Cities - Grid Layout */}
             <div>
               <div className="text-sm font-medium text-gray-700 mb-3">Major Cities</div>
               <div className="grid grid-cols-2 gap-3">
                 {AUSTRALIAN_LOCATIONS.slice(0, 4).map((location) => (
                   <div 
                     key={location.value} 
                     className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                       formData.location === location.value 
                         ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                         : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                     }`}
                     onClick={() => setFormData({...formData, location: location.value})}
                   >
                     <div className="font-medium text-sm">{location.name}</div>
                     <div className="text-xs text-gray-500">{location.population}</div>
                   </div>
                 ))}
               </div>
             </div>

             {/* Other Cities - Dropdown */}
             <div>
               <Label className="text-sm font-medium text-gray-700 mb-2 block">Other Cities</Label>
                                <select
                   value={['sydney', 'melbourne', 'brisbane', 'perth'].includes(formData.location) ? '' : formData.location}
                   onChange={(e) => setFormData({...formData, location: e.target.value})}
                   className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                 >
                 <option value="">Select a city...</option>
                 {AUSTRALIAN_LOCATIONS.slice(4).map((location) => (
                   <option key={location.value} value={location.value}>
                     {location.name}
                   </option>
                 ))}
               </select>
             </div>
           </div>
         );

      case 3:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <strong>Be accurate!</strong> We calculate how many authority links you should have and your ROI based on this amount.
            </p>
            <RadioGroup
              value={formData.spendRange}
              onValueChange={(value) => setFormData({...formData, spendRange: value})}
            >
              {SPEND_RANGES.map((range) => (
                <div key={range.value} className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent cursor-pointer"
                     onClick={() => setFormData({...formData, spendRange: range.value})}>
                  <RadioGroupItem value={range.value} id={range.value} />
                  <Label htmlFor={range.value} className="flex-1 cursor-pointer">
                    {range.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This helps us understand your SEO timeline
            </p>
            <RadioGroup
              value={formData.durationRange}
              onValueChange={(value) => setFormData({...formData, durationRange: value})}
            >
              {DURATION_RANGES.map((range) => (
                <div key={range.value} className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent cursor-pointer"
                     onClick={() => setFormData({...formData, durationRange: range.value})}>
                  <RadioGroupItem value={range.value} id={range.value} />
                  <Label htmlFor={range.value} className="flex-1 cursor-pointer">
                    {range.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter 1-3 keywords separated by commas (e.g., plumber Sydney, emergency plumbing)
            </p>
            <div className="space-y-2">
              <Label>Target Keywords</Label>
              <Input
                placeholder="keyword 1, keyword 2, keyword 3"
                value={formData.keywords}
                onChange={(e) => setFormData({...formData, keywords: e.target.value})}
              />
            </div>
            {formData.keywords && (
              <div className="text-xs text-muted-foreground">
                Keywords entered: {formData.keywords.split(',').length}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Landing Content */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            LinkScore
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            Keep your SEO service provider honest
          </p>
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Find out if your link building investment is delivering results
            </h2>
            <div className="space-y-3 text-left mb-6">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                <span className="text-gray-700">Your authority link count vs competitors</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                <span className="text-gray-700">ROI analysis of your SEO investment</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                <span className="text-gray-700">Missed link building opportunities</span>
              </div>
            </div>

            {/* Main Assessment Dialog */}
            <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <Dialog.Trigger asChild>
                <Button className="w-full text-lg h-12">
                  Start Free Assessment (2 minutes)
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-white p-0 shadow-lg">
                  <div className="border-b p-6">
                    <Dialog.Title className="text-lg font-semibold leading-none tracking-tight">
                      {getStepTitle()}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-gray-600 mt-2">
                      Step {currentStep} of {totalSteps}
                    </Dialog.Description>
                  </div>

                <div className="p-6">
                  {/* Progress bar */}
                  <div className="mb-6">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                      />
                    </div>
                  </div>

                  {renderStep()}

                  {/* Error message display */}
                  {submitError && (
                    <div className="mx-6 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-600">{submitError}</p>
                    </div>
                  )}
                </div>

                  <div className="border-t p-6 flex justify-between">
                    <div className="flex space-x-2">
                      {currentStep > 1 && (
                        <Button variant="outline" onClick={handlePrevious}>
                          <ChevronLeft className="w-4 h-4 mr-1" />
                          Back
                        </Button>
                      )}
                      <Dialog.Close asChild>
                        <Button variant="outline">Cancel</Button>
                      </Dialog.Close>
                    </div>
                    
                    <div>
                      {currentStep < totalSteps ? (
                        <Button 
                          onClick={handleNext}
                          disabled={!canProceed()}
                        >
                          Next
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      ) : (
                        <Button 
                          onClick={handleSubmit}
                          disabled={!canProceed() || isSubmitting}
                        >
                          {isSubmitting ? 'Analyzing...' : 'Analyze My SEO'}
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>

            <p className="text-xs text-gray-500 mt-4">
              ✓ Free Analysis • ✓ No Credit Card • ✓ Instant Results
            </p>

            {/* SEO Show Endorsement */}
            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="flex items-start space-x-4">
                <img 
                  src="/seo-show-hosts.png" 
                  alt="Michael and Arthur from The SEO Show" 
                  className="w-20 h-20 rounded-lg flex-shrink-0"
                />
                <div className="text-left">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    This free tool uses <span className="font-semibold text-blue-600">Michael & Arthur from The SEO Show's</span> proven metrics and scoring system to analyze your backlinks.
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed mt-2">
                    Find out if you're getting fair value from your SEO investment and see how you stack up against competitors.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
