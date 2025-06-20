import { NextRequest, NextResponse } from 'next/server';
import { AnalysisEngine, FormData } from '@/lib/analysis-engine';
import { securityMiddleware } from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    // Security middleware check
    const { isBlocked } = await securityMiddleware(request);
    if (isBlocked) {
      return NextResponse.json(
        { error: 'Request blocked due to security policy' },
        { status: 403 }
      );
    }

    // Parse form data
    const formData: FormData = await request.json();
    
    // Validate required fields
    const requiredFields = [
      'domain', 'email', 'location', 'monthlySpend', 
      'investmentMonths', 'spendRange', 'durationRange', 'keywords'
    ];
    
    const missingFields = requiredFields.filter(field => !formData[field as keyof FormData]);
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate data types and ranges
    if (typeof formData.monthlySpend !== 'number' || formData.monthlySpend < 1000) {
      return NextResponse.json(
        { error: 'Monthly spend must be at least $1,000' },
        { status: 400 }
      );
    }

    if (typeof formData.investmentMonths !== 'number' || formData.investmentMonths < 6) {
      return NextResponse.json(
        { error: 'Investment period must be at least 6 months' },
        { status: 400 }
      );
    }

    if (!Array.isArray(formData.keywords) || formData.keywords.length < 2 || formData.keywords.length > 5) {
      return NextResponse.json(
        { error: 'Please provide 2-5 keywords' },
        { status: 400 }
      );
    }

    // Initialize analysis engine
    const analysisEngine = new AnalysisEngine();
    
    // Create preliminary analysis record first
    const preliminaryResult = await analysisEngine.createPreliminaryAnalysis(formData, request);
    
    // Start analysis asynchronously with the existing analysis ID
    analysisEngine.performAnalysis(formData, request, preliminaryResult.analysisId).catch(error => {
      console.error('Background analysis failed:', error);
      // The error handling is already done in the analysis engine
    });
    
    // Return immediately with analysis ID so frontend can show loading screen
    return NextResponse.json({
      success: true,
      analysisId: preliminaryResult.analysisId,
      status: 'processing',
      message: 'Analysis started successfully'
    });

  } catch (error: any) {
    console.error('Analysis API error:', error);
    
    // Return user-friendly error messages
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    if (error.name === 'RateLimitError') {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }
    
    if (error.name === 'APIError') {
      return NextResponse.json(
        { error: 'Analysis service temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }
    
    // Generic error for unknown issues
    return NextResponse.json(
      { error: 'Analysis failed. Please try again or contact support.' },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
} 