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

// Generic scraper: fetch page HTML and extract video/iframe sources
async function scrapeGenericSite(url: string) {
    const res = await fetch(url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            Referer: url,
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch page: ${res.status}`);
    }

    const html = await res.text();

    // Extract page title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Unknown Video";

    // Extract OG image for thumbnail
    const ogImageMatch = html.match(
        /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
    );
    const thumbnail = ogImageMatch ? ogImageMatch[1] : "";

    // Strategy 1: Find direct video sources (mp4, webm, etc.)
    const videoSrcPatterns = [
        // <video src="...">
        /<video[^>]*\ssrc=["']([^"']+\.(?:mp4|webm|mkv|m3u8)[^"']*)["']/gi,
        // <source src="...">
        /<source[^>]*\ssrc=["']([^"']+\.(?:mp4|webm|mkv|m3u8)[^"']*)["']/gi,
        // JavaScript variables with video URLs
        /["']([^"']*\.(?:mp4|webm|mkv)(?:\?[^"']*)?)["']/gi,
        // m3u8 URLs in JavaScript
        /["'](https?:\/\/[^"']*\.m3u8(?:\?[^"']*)?)["']/gi,
    ];

    const directUrls = new Set<string>();
    for (const pattern of videoSrcPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const foundUrl = match[1];
            // Filter out obvious non-video URLs (icons, logos, etc.)
            if (
                foundUrl.startsWith("http") &&
                !foundUrl.includes("logo") &&
                !foundUrl.includes("favicon") &&
                !foundUrl.includes("icon") &&
                foundUrl.length < 500
            ) {
                directUrls.add(foundUrl);
            }
        }
    }

    // Strategy 2: Find iframe embeds (common in streaming sites)
    const iframePattern = /<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
    const embedUrls: string[] = [];
    let iframeMatch;
    while ((iframeMatch = iframePattern.exec(html)) !== null) {
        const iframeSrc = iframeMatch[1];
        // Filter to likely video embeds
        if (
            iframeSrc.includes("embed") ||
            iframeSrc.includes("player") ||
            iframeSrc.includes("stream") ||
            iframeSrc.includes("vidcloud") ||
            iframeSrc.includes("rabbitstream") ||
            iframeSrc.includes("dokicloud") ||
            iframeSrc.includes("megacloud") ||
            iframeSrc.includes("upcloud") ||
            iframeSrc.includes("vidsrc")
        ) {
            embedUrls.push(iframeSrc);
        }
    }

    // Strategy 3: For noozy.tv specifically, look for data-id attributes on server buttons
    const serverPattern =
        /data-id=["'](?:watch-)?(\d+)["'][^>]*>.*?<\/a>/gis;
    const serverIdPattern =
        /class=["'][^"']*link-item[^"']*["'][^>]*data-id=["'](\d+)["']/gi;
    const serverIds: string[] = [];
    let serverMatch;
    while ((serverMatch = serverIdPattern.exec(html)) !== null) {
        serverIds.push(serverMatch[1]);
    }

    // If we found server IDs (noozy.tv pattern), try to get sources via AJAX
    if (serverIds.length > 0) {
        const baseUrl = new URL(url);
        for (const serverId of serverIds) {
            try {
                const ajaxRes = await fetch(
                    `${baseUrl.origin}/ajax/sources/${serverId}`,
                    {
                        headers: {
                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                            "X-Requested-With": "XMLHttpRequest",
                            Referer: url,
                        },
                    }
                );
                if (ajaxRes.ok) {
                    const data = await ajaxRes.json();
                    if (data.link) {
                        embedUrls.push(data.link);
                    }
                }
            } catch {
                // Ignore AJAX failures
            }
        }
    }

    // If embed URLs found, try to follow them and extract video sources
    for (const embedUrl of embedUrls.slice(0, 3)) {
        // Limit to 3 to avoid timeout
        try {
            const embedRes = await fetch(embedUrl, {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    Referer: url,
                },
            });
            if (embedRes.ok) {
                const embedHtml = await embedRes.text();
                // Look for video URLs in the embed page
                const embedVideoPatterns = [
                    /["'](https?:\/\/[^"']*\.m3u8[^"']*)["']/gi,
                    /["'](https?:\/\/[^"']*\.mp4[^"']*)["']/gi,
                    /file:\s*["'](https?:\/\/[^"']+)["']/gi,
                    /source:\s*["'](https?:\/\/[^"']+)["']/gi,
                    /src:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/gi,
                ];
                for (const ep of embedVideoPatterns) {
                    let em;
                    while ((em = ep.exec(embedHtml)) !== null) {
                        if (em[1].startsWith("http")) {
                            directUrls.add(em[1]);
                        }
                    }
                }
            }
        } catch {
            // Ignore embed fetch failures
        }
    }

    // Build formats from found URLs
    const formats = Array.from(directUrls).map((videoUrl, index) => {
        const ext = videoUrl.includes(".m3u8")
            ? "m3u8 (HLS)"
            : videoUrl.includes(".webm")
                ? "webm"
                : "mp4";
        return {
            format_id: `generic-${index}`,
            format_note: `Source ${index + 1}`,
            ext,
            filesize: 0,
            resolution: ext === "m3u8 (HLS)" ? "Adaptive" : "Unknown",
            url: videoUrl,
        };
    });

    // If we still only have embed URLs (no direct video), present them as options
    if (formats.length === 0 && embedUrls.length > 0) {
        embedUrls.forEach((embedUrl, index) => {
            formats.push({
                format_id: `embed-${index}`,
                format_note: `Server ${index + 1}`,
                ext: "embed",
                filesize: 0,
                resolution: "Embedded Player",
                url: embedUrl,
            });
        });
    }

    return {
        id: Buffer.from(url).toString("base64").slice(0, 12),
        title: title.replace(/ - Watch.*| \| .*|Watch Free |HD Online.*| Full Movie.*/gi, "").trim(),
        thumbnail,
        duration_string: "N/A",
        formats,
        webpage_url: url,
        source: "generic",
    };
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    try {
        if (isYouTubeUrl(url)) {
            // YouTube handler
            const info = await ytdl.getInfo(url);
            const videoDetails = info.videoDetails;

            const formats = info.formats
                .filter(
                    (f) => f.hasVideo && f.hasAudio && f.container === "mp4"
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
            // Generic site scraper
            const result = await scrapeGenericSite(url);

            if (result.formats.length === 0) {
                return NextResponse.json(
                    {
                        error:
                            "No downloadable video sources found on this page. The video might be loaded dynamically via JavaScript encryption that cannot be extracted server-side.",
                    },
                    { status: 404 }
                );
            }

            return NextResponse.json(result);
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
