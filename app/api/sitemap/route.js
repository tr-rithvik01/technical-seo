import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const MAX_URLS = 50;

async function fetchSitemapUrls(sitemapUrl, visited = new Set(), extracted = new Set(), targetProtocol, targetHost) {
  if (visited.has(sitemapUrl) || extracted.size >= MAX_URLS) return;
  visited.add(sitemapUrl);

  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'Aura-SEO-Auditor/1.0' },
      next: { revalidate: 0 }
    });

    if (!res.ok) return;
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    // Handle standard urlsets
    $('urlset > url > loc').each((i, el) => {
      if (extracted.size < MAX_URLS) {
        let uText = $(el).text().trim();
        try {
          const base = targetProtocol && targetHost ? `${targetProtocol}//${targetHost}` : undefined;
          const parsed = new URL(uText, base);
          if (targetProtocol && targetHost) {
            parsed.protocol = targetProtocol;
            parsed.host = targetHost;
          }
          uText = parsed.toString();
        } catch (e) {
          // fallback if it fails
        }
        extracted.add(uText);
      }
    });

    // Handle nested sitemaps
    const sitemaps = $('sitemapindex > sitemap > loc').map((i, el) => $(el).text().trim()).get();
    for (const nestedUrl of sitemaps) {
      if (extracted.size >= MAX_URLS) break;
      await fetchSitemapUrls(nestedUrl, visited, extracted, targetProtocol, targetHost);
    }
  } catch (error) {
    console.error(`Error fetching sitemap ${sitemapUrl}:`, error);
  }
}

export async function POST(req) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://${targetUrl}`;
    }

    const parsedUrl = new URL(targetUrl);
    const domainUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    let sitemapUrls = [];

    // 1. Check robots.txt for sitemap declarations
    try {
      const robotsRes = await fetch(`${domainUrl}/robots.txt`);
      if (robotsRes.ok) {
        const robotsTxt = await robotsRes.text();
        const sitemapMatches = [...robotsTxt.matchAll(/Sitemap:\s*(.+)/gi)];
        if (sitemapMatches.length > 0) {
          sitemapUrls = sitemapMatches.map(m => m[1].trim());
        }
      }
    } catch (e) {
      console.error("Failed to fetch robots.txt", e);
    }

    // 2. Fallback to default sitemap
    if (sitemapUrls.length === 0) {
      sitemapUrls.push(`${domainUrl}/sitemap.xml`);
    }

    // 3. Extract URLs
    const extractedSet = new Set();
    const visitedSet = new Set();

    for (const sitemapUrl of sitemapUrls) {
      if (extractedSet.size >= MAX_URLS) break;
      await fetchSitemapUrls(sitemapUrl, visitedSet, extractedSet, parsedUrl.protocol, parsedUrl.host);
    }

    const finalUrls = Array.from(extractedSet);

    // If we failed to extract any URLs via sitemap, fallback to just crawling the homepage
    if (finalUrls.length === 0) {
      finalUrls.push(domainUrl);
    }

    return NextResponse.json({
      count: finalUrls.length,
      urls: finalUrls,
      sitemapsFound: sitemapUrls
    });

  } catch (error) {
    console.error("Sitemap API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
