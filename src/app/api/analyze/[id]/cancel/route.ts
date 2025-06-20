import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function POST(
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

    // Check if analysis exists and is cancellable
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { status: true, id: true }
    });

    if (!analysis) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    if (analysis.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot cancel completed analysis' },
        { status: 400 }
      );
    }

    if (analysis.status === 'cancelled') {
      return NextResponse.json(
        { message: 'Analysis already cancelled' },
        { status: 200 }
      );
    }

    // Mark analysis as cancelled in database
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'cancelled',
        errorMessage: 'Analysis cancelled by user',
        completedAt: new Date()
      }
    });

    console.log(`Analysis ${analysisId} cancelled by user`);

    return NextResponse.json({
      success: true,
      message: 'Analysis cancelled successfully',
      analysisId
    });

  } catch (error: any) {
    console.error('Cancel analysis error:', error);
    
    return NextResponse.json(
      { error: 'Failed to cancel analysis' },
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