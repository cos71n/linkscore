import { NextRequest, NextResponse } from 'next/server';
import { AnalysisEngine } from '@/lib/analysis-engine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: analysisId } = await params;
    
    if (!analysisId) {
      return NextResponse.json(
        { error: 'Analysis ID is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(analysisId)) {
      return NextResponse.json(
        { error: 'Invalid analysis ID format' },
        { status: 400 }
      );
    }

    const analysisEngine = new AnalysisEngine();
    const statusData = await analysisEngine.getAnalysisStatus(analysisId);
    
    // Parse detailed progress data if available
    let progressData = null;
    if (statusData.progressData) {
      // Use the progressData directly from the analysis engine
      progressData = statusData.progressData;
    } else if (statusData.message && statusData.status === 'processing') {
      try {
        // Legacy fallback: try to parse from message field
        progressData = JSON.parse(statusData.message);
      } catch (e) {
        // If not JSON, use the message as-is
        progressData = {
          step: statusData.status,
          message: statusData.message,
          percentage: statusData.progress || 0,
          personalized: false
        };
      }
    }
    
    const response = {
      analysisId,
      status: statusData.status,
      timestamp: new Date().toISOString()
    };
    
    // Add detailed progress data for processing status
    if (statusData.status === 'processing' && progressData) {
      return NextResponse.json({
        ...response,
        progress: {
          percentage: progressData.percentage || 0,
          step: progressData.step,
          message: progressData.message,
          personalized: progressData.personalized || false,
          data: progressData.data || null,
          timestamp: progressData.timestamp
        }
      });
    }
    
    // For completed status, return success
    if (statusData.status === 'completed') {
      return NextResponse.json({
        ...response,
        progress: {
          percentage: 100,
          step: 'completed',
          message: 'Analysis complete! Redirecting to results...',
          personalized: true
        }
      });
    }
    
    // For cancelled status, return cancellation message
    if (statusData.status === 'cancelled') {
      return NextResponse.json({
        ...response,
        progress: {
          percentage: 0,
          step: 'cancelled',
          message: 'Analysis was cancelled',
          personalized: false
        }
      });
    }
    
    // For failed status, return error details
    if (statusData.status === 'failed') {
      return NextResponse.json({
        ...response,
        error: statusData.message || 'Analysis failed',
        progress: {
          percentage: 0,
          step: 'failed',
          message: statusData.message || 'Analysis failed. Please try again.',
          personalized: false
        }
      });
    }
    
    // Default response for other statuses
    return NextResponse.json({
      ...response,
      progress: {
        percentage: 0,
        step: statusData.status || 'unknown',
        message: statusData.message || 'Processing...',
        personalized: false
      }
    });

  } catch (error: any) {
    console.error('Status check error:', error);
    
    if (error.message === 'Analysis not found') {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to check analysis status' },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function POST() {
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