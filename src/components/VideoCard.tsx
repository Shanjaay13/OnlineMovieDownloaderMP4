import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Download } from "lucide-react";
import { useState } from "react";

interface Format {
    format_id: string;
    format_note: string;
    ext: string;
    filesize: number;
    resolution: string;
}

interface VideoInfo {
    id: string;
    title: string;
    thumbnail: string;
    duration_string: string;
    formats: Format[];
    webpage_url: string;
}

interface VideoCardProps {
    info: VideoInfo;
    onDownload: (url: string, formatId: string) => void;
    loading?: boolean;
}

export function VideoCard({ info, onDownload, loading }: VideoCardProps) {
    const [selectedFormat, setSelectedFormat] = useState<string>(
        info.formats[0]?.format_id || ""
    );

    const handleDownload = () => {
        if (selectedFormat) {
            onDownload(info.webpage_url, selectedFormat);
        }
    };

    const formatLabel = (f: Format) => {
        const size = f.filesize ? ` - ${(f.filesize / 1024 / 1024).toFixed(1)}MB` : "";
        return `${f.resolution || f.format_note} (${f.ext})${size}`;
    };

    return (
        <Card className="w-full max-w-md mx-auto overflow-hidden bg-white/5 backdrop-blur-sm border-white/10">
            <div className="relative aspect-video w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={info.thumbnail}
                    alt={info.title}
                    className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                    {info.duration_string}
                </div>
            </div>
            <CardHeader>
                <CardTitle className="text-lg line-clamp-2 text-white">{info.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-200">Quality</label>
                    <Select
                        value={selectedFormat}
                        onChange={(e) => setSelectedFormat(e.target.value)}
                        className="w-full bg-slate-900 border-slate-700 text-white"
                    >
                        {info.formats.map((format) => (
                            <option key={format.format_id} value={format.format_id}>
                                {formatLabel(format)}
                            </option>
                        ))}
                    </Select>
                </div>
            </CardContent>
            <CardFooter>
                <Button
                    onClick={handleDownload}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={loading || !selectedFormat}
                    loading={loading}
                >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                </Button>
            </CardFooter>
        </Card>
    );
}
