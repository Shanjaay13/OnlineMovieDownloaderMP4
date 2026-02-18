import { NextResponse } from "next/server";
import youtubeDl from "youtube-dl-exec";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const formatId = searchParams.get("format_id");

    if (!url || !formatId) {
        return NextResponse.json({ error: "URL and format_id are required" }, { status: 400 });
    }

    try {
        const output = await youtubeDl(url, {
            getUrl: true,
            format: formatId,
        });

        // output is the direct URL string
        const directUrl = output?.toString().trim();

        if (directUrl) {
            return NextResponse.redirect(directUrl);
        } else {
            return NextResponse.json({ error: "Could not retrieve direct download link." }, { status: 404 });
        }
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to process download request." },
            { status: 500 }
        );
    }
}
