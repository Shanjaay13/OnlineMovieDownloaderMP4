import { NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";

function isYouTubeUrl(url: string): boolean {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)/.test(url);
}

function formatDuration(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
        return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${mins}:${String(secs).padStart(2, "0")}`;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    try {
        if (isYouTubeUrl(url)) {
            const info = await ytdl.getInfo(url);
            const videoDetails = info.videoDetails;

            // Get formats that have both video and audio (mp4 preferred)
            const formats = info.formats
                .filter(
                    (f) =>
                        f.hasVideo &&
                        f.hasAudio &&
                        f.container === "mp4"
                )
                .sort((a, b) => (b.height || 0) - (a.height || 0))
                .map((f) => ({
                    format_id: f.itag.toString(),
                    format_note: f.qualityLabel || f.quality || "unknown",
                    ext: f.container || "mp4",
                    filesize: parseInt(f.contentLength || "0", 10),
                    resolution: f.qualityLabel || `${f.width}x${f.height}`,
                    url: f.url,
                }));

            // Deduplicate by resolution
            const seen = new Set<string>();
            const uniqueFormats = formats.filter((f) => {
                if (seen.has(f.resolution)) return false;
                seen.add(f.resolution);
                return true;
            });

            return NextResponse.json({
                id: videoDetails.videoId,
                title: videoDetails.title,
                thumbnail:
                    videoDetails.thumbnails[videoDetails.thumbnails.length - 1]?.url || "",
                duration_string: formatDuration(parseInt(videoDetails.lengthSeconds)),
                formats: uniqueFormats,
                webpage_url: videoDetails.video_url,
                source: "youtube",
            });
        } else {
            return NextResponse.json(
                {
                    error:
                        "Currently, only YouTube URLs are supported. Support for more sites coming soon!",
                },
                { status: 400 }
            );
        }
    } catch (error: any) {
        console.error("Error fetching video info:", error.message);
        return NextResponse.json(
            {
                error:
                    "Failed to fetch video info. The URL might be invalid, age-restricted, or the video is unavailable.",
            },
            { status: 500 }
        );
    }
}
