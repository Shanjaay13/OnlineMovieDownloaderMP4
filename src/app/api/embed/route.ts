import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const embedUrl = searchParams.get("url");
    const title = searchParams.get("title") || "Video Player";

    if (!embedUrl) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Return an HTML page that embeds the video player in an iframe
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Universal Downloader</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a1a;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .header {
      width: 100%;
      padding: 16px 24px;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header a {
      color: #60a5fa;
      text-decoration: none;
      font-size: 14px;
    }
    .header a:hover { text-decoration: underline; }
    .header h1 {
      font-size: 16px;
      font-weight: 600;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .player-container {
      width: 100%;
      max-width: 1200px;
      aspect-ratio: 16/9;
      margin: 24px auto;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 0 40px rgba(59, 130, 246, 0.15);
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .tip {
      margin: 16px 24px;
      padding: 16px 20px;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 8px;
      max-width: 1200px;
      font-size: 14px;
      color: #93c5fd;
      line-height: 1.6;
    }
    .tip strong { color: #60a5fa; }
  </style>
</head>
<body>
  <div class="header">
    <a href="/">← Back</a>
    <h1>${title}</h1>
  </div>
  <div class="player-container">
    <iframe
      src="${embedUrl}"
      allowfullscreen
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerpolicy="origin"
    ></iframe>
  </div>
  <div class="tip">
    <strong>💡 How to download:</strong> Once the video starts playing, right-click the video → 
    "Save video as..." or use a browser extension like 
    <strong>Video DownloadHelper</strong> to capture the stream.
  </div>
</body>
</html>`;

    return new NextResponse(html, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
        },
    });
}
