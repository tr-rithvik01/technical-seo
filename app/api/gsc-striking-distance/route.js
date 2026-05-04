import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { siteUrl, accessToken } = await req.json();

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized. Please connect Google Search Console." }, { status: 401 });
    }

    if (!siteUrl) {
      return NextResponse.json({ error: "siteUrl is required" }, { status: 400 });
    }

    const parsedUrl = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
    const normalizedSiteUrl = `${parsedUrl.protocol}//${parsedUrl.host}/`;
    const encodedSiteUrl = encodeURIComponent(normalizedSiteUrl);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 90);
    const fmt = (d) => d.toISOString().split('T')[0];

    const gscRes = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["query", "page"],
          rowLimit: 25000,
          dataState: "all"
        })
      }
    );

    const gscData = await gscRes.json();

    if (!gscRes.ok) {
      return NextResponse.json({
        error: gscData.error?.message || "Failed to query Search Analytics"
      }, { status: gscRes.status });
    }

    const rows = gscData.rows || [];
    const keywords = rows
      .filter(row => row.position >= 11 && row.position <= 20)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 100)
      .map(row => ({
        query: row.keys[0],
        page: row.keys[1],
        position: Math.round(row.position * 10) / 10,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: (row.ctr * 100).toFixed(1)
      }));

    return NextResponse.json({ keywords, totalFound: keywords.length });

  } catch (error) {
    console.error("Striking Distance Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
