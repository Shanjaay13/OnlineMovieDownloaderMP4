const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
    res.json({ status: "ok", service: "video-extractor-api" });
});

// Extract video sources from noozy.tv
app.get("/api/extract", async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: "URL parameter is required" });
    }

    let browser;
    try {
        console.log(`[Extract] Starting extraction for: ${url}`);

        // Step 1: Get the embed URL from noozy.tv's AJAX API
        const embedUrl = await getEmbedUrl(url);
        if (!embedUrl) {
            return res.status(404).json({ error: "Could not find video embed URL" });
        }
        console.log(`[Extract] Found embed URL: ${embedUrl}`);

        const os = require("os");
        const path = require("path");
        const userDataDir = path.join(os.tmpdir(), "puppeteer-profile-" + Date.now());

        // Step 2: Launch headless browser to intercept video stream
        browser = await puppeteer.launch({
            headless: "new",
            userDataDir,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process",
                `--crash-dumps-dir=${userDataDir}/crashes`,
            ],
        });

        const page = await browser.newPage();

        // Set up request interception to capture m3u8/mp4 URLs
        const videoUrls = [];
        const subtitleUrls = [];

        await page.setRequestInterception(true);
        page.on("request", (request) => {
            const reqUrl = request.url();
            // Block ads and tracking
            if (
                reqUrl.includes("googletagmanager") ||
                reqUrl.includes("googlesyndication") ||
                reqUrl.includes("doubleclick") ||
                reqUrl.includes("google-analytics")
            ) {
                request.abort();
            } else {
                request.continue();
            }
        });

        page.on("response", async (response) => {
            const respUrl = response.url();
            const contentType = response.headers()["content-type"] || "";

            // Capture m3u8 playlist URLs
            if (
                respUrl.includes(".m3u8") ||
                contentType.includes("mpegurl") ||
                contentType.includes("x-mpegURL")
            ) {
                console.log(`[Extract] Found m3u8: ${respUrl}`);
                videoUrls.push({
                    url: respUrl,
                    type: "m3u8",
                    quality: "auto",
                });
            }

            // Capture direct mp4 URLs
            if (respUrl.includes(".mp4") && !respUrl.includes("thumb")) {
                console.log(`[Extract] Found mp4: ${respUrl}`);
                videoUrls.push({
                    url: respUrl,
                    type: "mp4",
                    quality: "direct",
                });
            }

            // Capture subtitle/VTT files
            if (respUrl.includes(".vtt") || respUrl.includes(".srt")) {
                console.log(`[Extract] Found subtitle: ${respUrl}`);
                subtitleUrls.push(respUrl);
            }

            // Also capture getSources API responses
            if (respUrl.includes("getSources") || respUrl.includes("getSource")) {
                try {
                    const text = await response.text();
                    console.log(`[Extract] getSources response: ${text.substring(0, 200)}`);

                    // Try to parse the response
                    const data = JSON.parse(text);
                    if (data.sources) {
                        // Sources might be encrypted (string) or an array
                        if (typeof data.sources === "string") {
                            // Encrypted sources - we'll handle via m3u8 interception
                            console.log("[Extract] Sources are encrypted, waiting for m3u8...");
                        } else if (Array.isArray(data.sources)) {
                            for (const source of data.sources) {
                                if (source.file || source.url) {
                                    videoUrls.push({
                                        url: source.file || source.url,
                                        type: source.file?.includes(".m3u8") ? "m3u8" : "mp4",
                                        quality: source.label || "auto",
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Response might not be JSON
                }
            }
        });

        // Set proper referrer and user agent
        await page.setExtraHTTPHeaders({
            Referer: "https://noozy.tv/",
        });

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );

        // Navigate to the embed URL
        console.log(`[Extract] Navigating to embed URL...`);
        await page.goto(embedUrl, {
            waitUntil: "networkidle2",
            timeout: 30000,
        });

        // Wait a bit for any async source loading
        console.log(`[Extract] Waiting for video sources to load...`);
        await delay(5000);

        // Try clicking play button if it exists
        try {
            await page.click(".jw-icon-display, .play-button, .vjs-big-play-button, [aria-label='Play']");
            console.log("[Extract] Clicked play button");
            await delay(5000);
        } catch {
            // No play button found, video might autoplay
        }

        // Also try to extract from JWPlayer instance
        try {
            const jwSources = await page.evaluate(() => {
                // Try JWPlayer
                if (typeof jwplayer !== "undefined") {
                    const player = jwplayer();
                    if (player && player.getPlaylistItem) {
                        const item = player.getPlaylistItem();
                        if (item && item.sources) {
                            return item.sources.map((s) => ({
                                url: s.file || s.src,
                                type: s.type || "unknown",
                                quality: s.label || "auto",
                            }));
                        }
                        if (item && item.file) {
                            return [{ url: item.file, type: "m3u8", quality: "auto" }];
                        }
                    }
                }
                // Try video element
                const video = document.querySelector("video");
                if (video && video.src) {
                    return [{ url: video.src, type: "mp4", quality: "auto" }];
                }
                return [];
            });

            if (jwSources && jwSources.length > 0) {
                console.log(`[Extract] Found JWPlayer sources:`, jwSources);
                videoUrls.push(...jwSources);
            }
        } catch (e) {
            console.log("[Extract] Could not extract from JWPlayer:", e.message);
        }

        // Wait a bit more for any remaining requests
        await delay(3000);

        await browser.close();
        browser = null;

        if (videoUrls.length === 0) {
            return res.status(404).json({
                error: "Could not find video stream URL",
                embed_url: embedUrl,
                hint: "The video sources may be encrypted. Try opening the embed URL directly.",
            });
        }

        // Deduplicate URLs
        const uniqueUrls = [...new Map(videoUrls.map((v) => [v.url, v])).values()];

        console.log(`[Extract] Extraction complete. Found ${uniqueUrls.length} sources.`);

        return res.json({
            success: true,
            sources: uniqueUrls,
            subtitles: subtitleUrls,
            embed_url: embedUrl,
        });
    } catch (error) {
        console.error(`[Extract] Error:`, error.message);
        if (browser) {
            try { await browser.close(); } catch { }
        }
        return res.status(500).json({
            error: "Extraction failed",
            message: error.message,
        });
    }
});

// Helper: Get embed URL from noozy.tv AJAX endpoint
async function getEmbedUrl(noozyUrl) {
    // Extract linkId from URL
    const urlParts = noozyUrl.split(".");
    const linkId = urlParts[urlParts.length - 1];

    if (!linkId || !/^\d+$/.test(linkId)) {
        return null;
    }

    try {
        const response = await fetch(
            `https://noozy.tv/ajax/episode/sources/${linkId}`,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "X-Requested-With": "XMLHttpRequest",
                    Referer: noozyUrl,
                },
            }
        );

        if (response.ok) {
            const data = await response.json();
            return data.link || null;
        }
    } catch (e) {
        console.error("[getEmbedUrl] Error:", e.message);
    }

    // Try other server IDs by scraping the page
    try {
        const pageRes = await fetch(noozyUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        });
        const html = await pageRes.text();
        const serverPattern = /data-linkid=["'](\d+)["']/gi;
        let match;
        while ((match = serverPattern.exec(html)) !== null) {
            if (match[1] !== linkId) {
                const altRes = await fetch(
                    `https://noozy.tv/ajax/episode/sources/${match[1]}`,
                    {
                        headers: {
                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                            "X-Requested-With": "XMLHttpRequest",
                            Referer: noozyUrl,
                        },
                    }
                );
                if (altRes.ok) {
                    const data = await altRes.json();
                    if (data.link) return data.link;
                }
            }
        }
    } catch (e) {
        console.error("[getEmbedUrl] Scrape Error:", e.message);
    }

    return null;
}

app.listen(PORT, () => {
    console.log(`Video Extractor API running on port ${PORT}`);
});
