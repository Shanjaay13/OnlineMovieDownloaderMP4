"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/VideoCard";
import { Loader2 } from "lucide-react";

export default function Home() {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [videoInfo, setVideoInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchVideoInfo = async () => {
        if (!url) return;
        setLoading(true);
        setError(null);
        setVideoInfo(null);

        try {
            const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch video info");
            }

            setVideoInfo(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = (videoUrl: string, formatId: string) => {
        window.open(
            `/api/download?url=${encodeURIComponent(videoUrl)}&itag=${formatId}`,
            "_blank"
        );
    };

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-blue-500/30">
            <div className="w-full max-w-2xl space-y-8 text-center">
                {/* Hero */}
                <div className="space-y-4">
                    <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent pb-2">
                        Universal Downloader
                    </h1>
                    <p className="text-lg text-slate-400">
                        Download high-quality videos from your favorite streaming sites.
                    </p>
                </div>

                {/* Input */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <Input
                        type="url"
                        placeholder="Paste a YouTube URL here..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="h-12 bg-slate-900 border-slate-800 text-lg placeholder:text-slate-500 focus-visible:ring-blue-500"
                        onKeyDown={(e) => e.key === "Enter" && fetchVideoInfo()}
                    />
                    <Button
                        size="lg"
                        onClick={fetchVideoInfo}
                        disabled={loading}
                        className="h-12 px-8 bg-blue-600 hover:bg-blue-700 font-semibold"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Analyze"}
                    </Button>
                </div>

                {/* Error */}
                {error && (
                    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                        {error}
                    </div>
                )}

                {/* Video Card */}
                {videoInfo && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <VideoCard info={videoInfo} onDownload={handleDownload} />
                    </div>
                )}
            </div>

            <footer className="mt-16 text-slate-500 text-sm">
                <p>For educational purposes only.</p>
            </footer>
        </main>
    );
}
