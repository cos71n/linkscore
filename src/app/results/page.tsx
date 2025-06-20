export default function ResultsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container-mobile py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Your LinkScore Results
          </h1>
          <p className="text-gray-600">
            Analysis complete - here's how your SEO is performing
          </p>
        </header>

        {/* Placeholder for results display */}
        <section className="space-y-6">
          {/* Score Display */}
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-white">8.5</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Your LinkScore
            </h2>
            <p className="text-gray-600">
              Your SEO is performing well with room for improvement
            </p>
          </div>

          {/* Analysis Breakdown */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Analysis Breakdown
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Performance Score</span>
                <span className="font-semibold text-gray-900">7.2/10</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Competitive Score</span>
                <span className="font-semibold text-gray-900">8.1/10</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Opportunity Score</span>
                <span className="font-semibold text-gray-900">6.8/10</span>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Ready to Improve Your Results?
            </h3>
            <p className="text-gray-600 mb-6">
              Get a personalized SEO growth plan based on your analysis
            </p>
            <button className="btn-primary w-full mb-3">
              Get Your Growth Plan
            </button>
            <button className="btn-secondary w-full">
              Run Another Assessment
            </button>
          </div>
        </section>
      </div>
    </main>
  );
} 