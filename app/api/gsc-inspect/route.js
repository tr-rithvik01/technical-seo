import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
      return NextResponse.json({ error: "Unauthorized. Please connect Google Search Console." }, { status: 401 });
    }

    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Determine the siteUrl from the inspectionUrl
    const parsedUrl = new URL(url);
    const siteUrl = `${parsedUrl.protocol}//${parsedUrl.host}/`;

    const gscRes = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inspectionUrl: url,
        siteUrl: siteUrl,
        languageCode: "en-US"
      })
    });

    const gscData = await gscRes.json();

    if (!gscRes.ok) {
      console.error("GSC API Error:", gscData);
      return NextResponse.json({ 
        error: gscData.error?.message || "Failed to inspect URL with Google Search Console" 
      }, { status: gscRes.status });
    }

    return NextResponse.json(gscData);

  } catch (error) {
    console.error("GSC Inspection Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
