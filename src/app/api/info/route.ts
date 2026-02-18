import { NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";

function isYouTubeUrl(url: string): boolean {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)/.test(url);
}

function isNoozyUrl(url: string): boolean {
    return /noozy\.tv/i.test(url);
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

const FETCH_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// ====== NOOZY.TV EXTRACTOR ======
async function extractNoozyTv(url: string) {
    // URL format: https://noozy.tv/watch-movie/slug-{movieId}.{linkId}
    //          or: https://noozy.tv/watch-tv/slug-{showId}.{linkId}
    const urlParts = url.split(".");
    const linkId = urlParts[urlParts.length - 1]; // e.g. "5507374"

    // Extract slug and type
    const pathMatch = url.match(/\/(watch-movie|watch-tv)\/([^.]+)/);
    const isMovie = pathMatch ? pathMatch[1] === "watch-movie" : true;
    const slug = pathMatch ? pathMatch[2] : "Unknown";

    // Extract TMDB ID from the slug (number at end of slug before the dot)
    const tmdbMatch = slug.match(/-(\d+)$/);
    const tmdbId = tmdbMatch ? tmdbMatch[1] : "";

    const prettyTitle = slug
        .replace(/-\d+$/, "") // remove trailing TMDB ID
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    // Fetch the watch page to get metadata
    let thumbnail = "";
    try {
        const pageRes = await fetch(url, { headers: FETCH_HEADERS });
        const pageHtml = await pageRes.text();
        const ogImageMatch = pageHtml.match(
            /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
        );
        thumbnail = ogImageMatch ? ogImageMatch[1] : "";
    } catch {
        // Continue without thumbnail
    }

    // Build formats using alternative TMDB-based providers
    const formats: Array<{
        format_id: string;
        format_note: string;
        ext: string;
        filesize: number;
        resolution: string;
        url: string;
    }> = [];

    if (tmdbId) {
        const mediaType = isMovie ? "movie" : "tv";

        // Provider 1: vidsrc.icu - reliable, no referrer check
        formats.push({
            format_id: "vidsrc-icu",
            format_note: "VidSrc Server (Recommended)",
            ext: "embed",
            filesize: 0,
            resolution: "HD / Full HD",
            url: `https://vidsrc.icu/embed/${mediaType}/${tmdbId}`,
        });

        // Provider 2: vidsrc.cc
        formats.push({
            format_id: "vidsrc-cc",
            format_note: "VidSrc CC Server",
            ext: "embed",
            filesize: 0,
            resolution: "HD / Full HD",
            url: `https://vidsrc.cc/v2/embed/${mediaType}/${tmdbId}`,
        });

        // Provider 3: 2embed
        formats.push({
            format_id: "2embed",
            format_note: "2Embed Server",
            ext: "embed",
            filesize: 0,
            resolution: "HD",
            url: `https://www.2embed.cc/embed/${tmdbId}`,
        });

        // Provider 4: multiembed
        formats.push({
            format_id: "multiembed",
            format_note: "MultiEmbed Server",
            ext: "embed",
            filesize: 0,
            resolution: "HD / Full HD",
            url: `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1`,
        });
    }

    // Also try noozy.tv's own AJAX sources as extra option
    if (linkId && /^\d+$/.test(linkId)) {
        try {
            const sourceRes = await fetch(
                `https://noozy.tv/ajax/episode/sources/${linkId}`,
                {
                    headers: {
                        ...FETCH_HEADERS,
                        "X-Requested-With": "XMLHttpRequest",
                        Referer: url,
                    },
                }
            );
            if (sourceRes.ok) {
                const data = await sourceRes.json();
                if (data.link) {
                    formats.push({
                        format_id: "noozy-original",
                        format_note: "Noozy Original Server",
                        ext: "embed",
                        filesize: 0,
                        resolution: "HD",
                        url: data.link,
                    });
                }
            }
        } catch {
            // Skip
        }
    }

    return {
        id: tmdbId || linkId || slug,
        title: prettyTitle,
        thumbnail,
        duration_string: "Full Movie",
        formats,
        webpage_url: url,
        source: "noozy",
    };
}

// ====== GENERIC SCRAPER ======
async function scrapeGenericSite(url: string) {
    const res = await fetch(url, {
        headers: { ...FETCH_HEADERS, Referer: url },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch page: ${res.status}`);
    }

    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Unknown Video";

    const ogImageMatch = html.match(
        /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
    );
    const thumbnail = ogImageMatch ? ogImageMatch[1] : "";

    // Find direct video sources
    const videoSrcPatterns = [
        /<video[^>]*\ssrc=["']([^"']+\.(?:mp4|webm|mkv|m3u8)[^"']*)["']/gi,
        /<source[^>]*\ssrc=["']([^"']+\.(?:mp4|webm|mkv|m3u8)[^"']*)["']/gi,
        /["'](https?:\/\/[^"']*\.m3u8(?:\?[^"']*)?)["']/gi,
        /file:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/gi,
        /source:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/gi,
    ];

    const directUrls = new Set<string>();
    for (const pattern of videoSrcPatterns) {
        let m;
        while ((m = pattern.exec(html)) !== null) {
            if (
                m[1].startsWith("http") &&
                !m[1].includes("logo") &&
                !m[1].includes("favicon") &&
                m[1].length < 500
            ) {
                directUrls.add(m[1]);
            }
        }
    }

    // Find iframe embeds
    const iframePattern = /<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
    const embedUrls: string[] = [];
    let iframeMatch;
    while ((iframeMatch = iframePattern.exec(html)) !== null) {
        const src = iframeMatch[1];
        if (
            src.includes("embed") ||
            src.includes("player") ||
            src.includes("stream") ||
            src.includes("vidsrc")
        ) {
            embedUrls.push(src);
        }
    }

    // Try to follow embeds and extract video URLs
    for (const embedUrl of embedUrls.slice(0, 3)) {
        try {
            const embedRes = await fetch(embedUrl, {
                headers: { ...FETCH_HEADERS, Referer: url },
            });
            if (embedRes.ok) {
                const embedHtml = await embedRes.text();
                const embedPatterns = [
                    /["'](https?:\/\/[^"']*\.m3u8[^"']*)["']/gi,
                    /["'](https?:\/\/[^"']*\.mp4[^"']*)["']/gi,
                ];
                for (const ep of embedPatterns) {
                    let em;
                    while ((em = ep.exec(embedHtml)) !== null) {
                        if (em[1].startsWith("http")) directUrls.add(em[1]);
                    }
                }
            }
        } catch {
            // Ignore
        }
    }

    const formats = Array.from(directUrls).map((videoUrl, index) => {
        const ext = videoUrl.includes(".m3u8") ? "m3u8" : videoUrl.includes(".webm") ? "webm" : "mp4";
        return {
            format_id: `generic-${index}`,
            format_note: `Source ${index + 1}`,
            ext,
            filesize: 0,
            resolution: ext === "m3u8" ? "Adaptive" : "Unknown",
            url: videoUrl,
        };
    });

    if (formats.length === 0 && embedUrls.length > 0) {
        embedUrls.forEach((eUrl, index) => {
            formats.push({
                format_id: `embed-${index}`,
                format_note: `Server ${index + 1}`,
                ext: "embed",
                filesize: 0,
                resolution: "Embedded Player",
                url: eUrl,
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

// ====== MAIN HANDLER ======
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

            const formats = info.formats
                .filter((f: any) => f.hasVideo && f.hasAudio && f.container === "mp4")
                .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))
                .map((f: any) => ({
                    format_id: f.itag.toString(),
                    format_note: f.qualityLabel || f.quality || "unknown",
                    ext: f.container || "mp4",
                    filesize: parseInt(f.contentLength || "0", 10),
                    resolution: f.qualityLabel || `${f.width}x${f.height}`,
                    url: f.url,
                }));

            const seen = new Set<string>();
            const uniqueFormats = formats.filter((f: any) => {
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
        } else if (isNoozyUrl(url)) {
            const result = await extractNoozyTv(url);

            if (result.formats.length === 0) {
                return NextResponse.json(
                    { error: "No servers found for this video on noozy.tv. The video might have been removed." },
                    { status: 404 }
                );
            }

            return NextResponse.json(result);
        } else {
            const result = await scrapeGenericSite(url);

            if (result.formats.length === 0) {
                return NextResponse.json(
                    {
                        error:
                            "No downloadable video sources found on this page. The video might be loaded dynamically via JavaScript encryption.",
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
