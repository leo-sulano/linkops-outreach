import Link from 'next/link';

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
            <div className="container mx-auto px-4 py-20">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-5xl font-bold mb-6">LinkOps</h1>
                    <p className="text-2xl text-slate-300 mb-8">
                        AI-Powered Link Insertion Outreach Platform
                    </p>

                    <p className="text-lg text-slate-400 mb-12 leading-relaxed">
                        Automate your link insertion campaigns with AI-powered outreach.
                        Scale your link building efforts with intelligent prospecting,
                        personalized email generation, and deal tracking.
                    </p>

                    <div className="flex gap-4 justify-center">
                        <Link
                            href="/dashboard"
                            className="bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-lg font-semibold transition"
                        >
                            Launch Dashboard
                        </Link>
                        <a
                            href="#features"
                            className="border border-slate-400 hover:bg-slate-700 px-8 py-4 rounded-lg font-semibold transition"
                        >
                            Learn More
                        </a>
                    </div>

                    <div id="features" className="mt-20 grid md:grid-cols-3 gap-8">
                        <div className="bg-slate-700 p-6 rounded-lg">
                            <h3 className="text-xl font-bold mb-3">Paul AI Agent</h3>
                            <p className="text-slate-300">
                                Automated email outreach with Claude AI for personalized messages
                            </p>
                        </div>

                        <div className="bg-slate-700 p-6 rounded-lg">
                            <h3 className="text-xl font-bold mb-3">Content Generation</h3>
                            <p className="text-slate-300">
                                AI-powered article and content suggestions for outreach
                            </p>
                        </div>

                        <div className="bg-slate-700 p-6 rounded-lg">
                            <h3 className="text-xl font-bold mb-3">Deal Tracking</h3>
                            <p className="text-slate-300">
                                Track negotiations, closed deals, and link placements
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
