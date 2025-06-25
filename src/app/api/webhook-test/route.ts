import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('🧪 Webhook test endpoint called');
  
  const config = {
    hasZapierUrl: !!process.env.ZAPIER_WEBHOOK_URL,
    hasCrmUrl: !!process.env.CRM_WEBHOOK_URL,
    hasBaseUrl: !!process.env.NEXT_PUBLIC_BASE_URL,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
    zapierUrlPrefix: process.env.ZAPIER_WEBHOOK_URL?.substring(0, 30),
    nodeEnv: process.env.NODE_ENV,
    vercelUrl: process.env.VERCEL_URL
  };
  
  console.log('📋 Webhook configuration:', config);
  
  return NextResponse.json({
    message: 'Webhook configuration check',
    config,
    timestamp: new Date().toISOString()
  });
}

export async function POST(request: NextRequest) {
  console.log('🧪 Webhook test - manual trigger');
  
  try {
    const { analysisId } = await request.json();
    
    if (!analysisId) {
      return NextResponse.json(
        { error: 'analysisId is required' },
        { status: 400 }
      );
    }
    
    // Import and use the webhook route directly
    const webhookRequest = new Request(`${request.url.replace('/webhook-test', '/webhook')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ analysisId })
    });
    
    const { POST: webhookHandler } = await import('../webhook/route');
    const response = await webhookHandler(webhookRequest as NextRequest);
    const result = await response.json();
    
    return NextResponse.json({
      message: 'Webhook test completed',
      webhookResult: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('❌ Webhook test error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook test failed' },
      { status: 500 }
    );
  }
} 