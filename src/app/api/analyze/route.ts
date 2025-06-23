import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { AnalysisEngine, FormData } from '@/lib/analysis-engine';
import { securityMiddleware } from '@/lib/security';
import { checkDomainBlocklist } from '@/lib/domain-blocklist';

// Force fresh deployment after schema changes
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Analysis API called');
    
    // Security middleware check
    console.log('🔒 Running security middleware...');
    const { isBlocked } = await securityMiddleware(request);
    if (isBlocked) {
      return NextResponse.json(
        { error: 'Request blocked due to security policy' },
        { status: 403 }
      );
    }
    console.log('✅ Security check passed');

    // Parse form data
    console.log('📝 Parsing form data...');
    const formData: FormData = await request.json();
    console.log('📊 Form data received:', JSON.stringify(formData, null, 2));
    
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

    // Domain blocklist check - BEFORE any processing
    console.log('🚫 Checking domain blocklist...');
    const blocklistResult = await checkDomainBlocklist(formData.domain);
    if (blocklistResult.isBlocked) {
      console.log(`🚫 Domain blocked: ${formData.domain}`);
      return NextResponse.json(
        { error: blocklistResult.error },
        { status: 503 } // Service Temporarily Unavailable
      );
    }
    console.log('✅ Domain blocklist check passed');

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

    console.log('✅ Form validation passed');
    
    // Initialize analysis engine
    console.log('🔧 Initializing analysis engine...');
    const analysisEngine = new AnalysisEngine();
    
    // Create preliminary analysis record
    console.log('💾 Creating preliminary analysis record...');
    const preliminaryResult = await analysisEngine.createPreliminaryAnalysis(formData, request);
    console.log('✅ Preliminary analysis created:', preliminaryResult.analysisId);
    
    // Start background analysis using waitUntil to keep function alive
    console.log('🚀 Starting background analysis using waitUntil...');
    waitUntil(
      analysisEngine.performAnalysis(formData, request, preliminaryResult.analysisId)
        .then(() => {
          console.log('✅ Background analysis completed successfully for:', preliminaryResult.analysisId);
        })
        .catch((error) => {
          console.error('❌ Background analysis failed for:', preliminaryResult.analysisId, error);
          // Error handling is done within performAnalysis
        })
    );
    
    // Return success immediately with analysis ID for live streaming
    return NextResponse.json({
      success: true,
      analysisId: preliminaryResult.analysisId,
      status: 'processing',
      message: 'Analysis started successfully - processing in background'
    });

  } catch (error: any) {
    console.error('❌ Analysis API error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
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
      { error: 'Analysis failed. Please try again or contact support.', details: error.message },
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