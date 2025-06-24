'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface DatabaseStatus {
  health: any;
  resources: any;
  stuckAnalysesCount: number;
  availableActions: string[];
}

interface StuckAnalysis {
  id: string;
  domain: string;
  status: string;
  ageMinutes: number;
  createdAt: string;
}

export default function DatabaseAdminPage() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [stuckAnalyses, setStuckAnalyses] = useState<StuckAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Load initial status
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/debug/database');
      const data = await response.json();
      setStatus(data);
      setError('');
    } catch (err) {
      setError('Failed to load database status');
      console.error('Status load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStuckAnalyses = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/debug/database?action=stuck-analyses');
      const data = await response.json();
      setStuckAnalyses(data.analyses || []);
      setError('');
    } catch (err) {
      setError('Failed to load stuck analyses');
      console.error('Stuck analyses load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const performAction = async (action: string, method: 'GET' | 'POST' = 'GET', body?: any) => {
    try {
      setLoading(true);
      setMessage('');
      setError('');

      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (method === 'POST' && body) {
        options.body = JSON.stringify(body);
      }

      const url = method === 'GET' ? `/api/debug/database?action=${action}` : '/api/debug/database';
      const response = await fetch(url, options);
      const data = await response.json();

      if (response.ok) {
        setMessage(data.message || `${action} completed successfully`);
        // Refresh status after actions
        setTimeout(loadStatus, 1000);
      } else {
        setError(data.error || `${action} failed`);
      }
    } catch (err) {
      setError(`Failed to perform ${action}`);
      console.error('Action error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Database Resource Management</h1>
        
        {/* Status Display */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Database Status</h2>
            <Button 
              onClick={loadStatus} 
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
          
          {status && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-700 mb-2">Health Status</h3>
                <p className={`text-sm ${status.health.status === 'healthy' ? 'text-green-600' : 'text-red-600'}`}>
                  {status.health.status === 'healthy' ? '✅ Healthy' : '❌ Unhealthy'}
                </p>
                <p className="text-xs text-gray-500">Response: {status.health.responseTime}</p>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-700 mb-2">Resource Usage</h3>
                <p className="text-sm text-gray-600">
                  Connections: {status.resources.connections?.total_connections || 'N/A'}
                </p>
                <p className="text-sm text-gray-600">
                  Stuck Analyses: <span className={status.stuckAnalysesCount > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>{status.stuckAnalysesCount}</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        {message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 text-sm">✅ {message}</p>
          </div>
        )}
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">❌ {error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Button 
              onClick={() => performAction('cleanup')}
              disabled={loading}
              variant="outline"
              className="text-sm"
            >
              🧹 Cleanup Stuck
            </Button>
            
            <Button 
              onClick={() => performAction('kill-queries')}
              disabled={loading}
              variant="outline"
              className="text-sm"
            >
              🔪 Kill Long Queries
            </Button>
            
            <Button 
              onClick={loadStuckAnalyses}
              disabled={loading}
              variant="outline"
              className="text-sm"
            >
              📋 View Stuck Analyses
            </Button>
            
            <Button 
              onClick={() => performAction('force-cleanup', 'POST', { action: 'force-cleanup' })}
              disabled={loading}
              variant="secondary"
              className="text-sm"
            >
              🚨 Force Cleanup
            </Button>
            
            <Button 
              onClick={() => performAction('resources')}
              disabled={loading}
              variant="outline"
              className="text-sm"
            >
              📊 Resource Usage
            </Button>
            
            <Button 
              onClick={() => {
                if (confirm('This will cancel ALL processing analyses. Are you sure?')) {
                  performAction('emergency-reset', 'POST', { action: 'emergency-reset' });
                }
              }}
              disabled={loading}
              variant="destructive"
              className="text-sm"
            >
              🆘 Emergency Reset
            </Button>
          </div>
        </div>

        {/* Stuck Analyses Table */}
        {stuckAnalyses.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Stuck Analyses ({stuckAnalyses.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Domain</th>
                    <th className="text-left p-2">Age (min)</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {stuckAnalyses.map((analysis) => (
                    <tr key={analysis.id} className="border-b">
                      <td className="p-2 font-mono text-xs">{analysis.domain}</td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          analysis.ageMinutes > 30 ? 'bg-red-100 text-red-800' : 
                          analysis.ageMinutes > 15 ? 'bg-orange-100 text-orange-800' : 
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {analysis.ageMinutes}m
                        </span>
                      </td>
                      <td className="p-2 text-xs">{analysis.status}</td>
                      <td className="p-2 text-xs">{new Date(analysis.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">How to Use</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• <strong>Cleanup Stuck:</strong> Automatically fail analyses older than 15 minutes</li>
            <li>• <strong>Kill Long Queries:</strong> Terminate database queries running longer than 10 minutes</li>
            <li>• <strong>Force Cleanup:</strong> More aggressive cleanup (10 min + 5 min query timeout)</li>
            <li>• <strong>Emergency Reset:</strong> Cancel ALL processing analyses and kill all queries</li>
            <li>• <strong>View Stuck Analyses:</strong> Show all analyses stuck in processing state</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 