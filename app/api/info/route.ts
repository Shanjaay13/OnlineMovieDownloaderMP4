import { NextResponse } from "next/server";
import youtubeDl from "youtube-dl-exec";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    try {
        // Using promises:
        const output = await youtubeDl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true,
            // We don't want to actually download
        });

        // Process formats: prioritize MP4 with audio
        const formats = (output.formats || [])
            .filter((f: any) => f.ext === "mp4" && f.acodec !== "none" && f.vcodec !== "none")
            .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))
            .map((f: any) => ({
                format_id: f.format_id,
                format_note: f.format_note,
                ext: f.ext,
                filesize: f.filesize,
                resolution: f.resolution || `${f.width}x${f.height}`,
            }));

        return NextResponse.json({
            id: output.id,
            title: output.title,
            thumbnail: output.thumbnail,
            duration_string: output.duration_string,
            formats: formats,
            webpage_url: output.webpage_url,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to fetch video info. URL might be invalid or unsupported." },
            { status: 500 }
        );
    }
}
