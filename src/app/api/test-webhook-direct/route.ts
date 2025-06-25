import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('🔧 Testing direct webhook to Zapier...');
  
  const zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL;
  
  if (!zapierWebhookUrl) {
    return NextResponse.json({
      error: 'ZAPIER_WEBHOOK_URL not configured',
      instruction: 'Please set ZAPIER_WEBHOOK_URL in Vercel environment variables'
    }, { status: 500 });
  }
  
  try {
    // Test payload
    const testPayload = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'Direct webhook test from LinkScore',
      analysisId: 'test-' + Date.now(),
      results: {
        linkScore: 75,
        domain: 'test.com',
        status: 'test'
      }
    };
    
    console.log('📤 Sending test webhook to:', zapierWebhookUrl.substring(0, 50) + '...');
    console.log('📦 Payload:', JSON.stringify(testPayload, null, 2));
    
    const response = await fetch(zapierWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LinkScore/1.0',
        'X-Webhook-Source': 'LinkScore-Test'
      },
      body: JSON.stringify(testPayload)
    });
    
    const responseText = await response.text();
    
    console.log('📨 Response status:', response.status);
    console.log('📄 Response body:', responseText);
    
    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseBody: responseText,
      webhookUrl: zapierWebhookUrl.substring(0, 50) + '...',
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('❌ Webhook test failed:', error);
    
    return NextResponse.json({
      error: 'Webhook test failed',
      message: error.message,
      type: error.name,
      webhookUrl: zapierWebhookUrl.substring(0, 50) + '...'
    }, { status: 500 });
  }
} 