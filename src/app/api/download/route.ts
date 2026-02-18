import { NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const itag = searchParams.get("itag");
    const directUrl = searchParams.get("direct_url");

    // For generic sites: redirect to the direct URL
    if (directUrl) {
        return NextResponse.redirect(directUrl);
    }

    // For YouTube: use ytdl-core to resolve itag to URL
    if (!url || !itag) {
        return NextResponse.json(
            { error: "URL and itag (or direct_url) are required" },
            { status: 400 }
        );
    }

    try {
        const info = await ytdl.getInfo(url);
        const format = info.formats.find(
            (f) => f.itag.toString() === itag
        );

        if (!format || !format.url) {
            return NextResponse.json(
                { error: "Format not found." },
                { status: 404 }
            );
        }

        return NextResponse.redirect(format.url);
    } catch (error: any) {
        console.error("Download error:", error.message);
        return NextResponse.json(
            { error: "Failed to process download." },
            { status: 500 }
        );
    }
}
