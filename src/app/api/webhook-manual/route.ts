import { NextRequest, NextResponse } from 'next/server';
import { AnalysisEngine } from '@/lib/analysis-engine-adapter';

export async function POST(request: NextRequest) {
  console.log('🧪 Manual webhook trigger called');
  
  try {
    const { analysisId } = await request.json();
    
    if (!analysisId) {
      return NextResponse.json(
        { error: 'analysisId is required' },
        { status: 400 }
      );
    }
    
    console.log(`📋 Triggering webhook manually for analysis: ${analysisId}`);
    
    // Create an instance of AnalysisEngine
    const engine = new AnalysisEngine();
    
    // Access the private method using TypeScript type assertion
    const engineWithPrivate = engine as any;
    
    // Manually trigger the webhook
    console.log('🚀 Calling triggerZapierWebhook...');
    await engineWithPrivate.triggerZapierWebhook(analysisId);
    
    return NextResponse.json({
      success: true,
      message: `Webhook triggered for analysis ${analysisId}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('❌ Manual webhook trigger error:', error);
    console.error('Error stack:', error.stack);
    
    return NextResponse.json(
      { 
        error: 'Failed to trigger webhook', 
        details: error.message,
        stack: error.stack 
      },
      { status: 500 }
    );
  }
} 