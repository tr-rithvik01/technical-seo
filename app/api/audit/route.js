import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(req) {
  try {
    const { url, analyzeDomainInfrastructure = false } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const parsedUrl = new URL(url);
    const domainUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Initialize results object for this specific page
    const results = {
      url,
      status: 200,
      meta: {},
      headings: {},
      schema: { found: false, types: [] },
      // Optional domain-level checks
      robots: null,
      llms: null,
      performance: {
        // Simulated metrics for demo purposes since we don't have a real headless browser attached
        inp: Math.floor(Math.random() * 300) + 50,
        lcp: (Math.random() * 2 + 0.5).toFixed(1)
      }
    };

    // 1. Fetch HTML for the specific URL
    let startTime;
    try {
      startTime = Date.now();
      const htmlRes = await fetch(url, {
        headers: { 'User-Agent': 'Aura-SEO-Auditor/1.0' },
        next: { revalidate: 0 },
        // Use an abort controller for hard timeouts (e.g., 10 seconds)
        signal: AbortSignal.timeout(10000)
      });
      
      const responseTime = Date.now() - startTime;
      results.status = htmlRes.status;
      
      // Capture headers for WAF analysis
      const headersObj = {};
      htmlRes.headers.forEach((value, key) => { headersObj[key] = value; });
      const headersStr = JSON.stringify(headersObj).toLowerCase();

      // Diagnostic Rules & Logic for Availability (g1)
      results.availabilityAnalysis = {
        status: "Healthy",
        root_cause_analysis: `The server responded successfully in ${responseTime}ms.`,
        user_action: "No action required. The page is fully accessible to crawlers and users.",
        rawData: {
          responseTime,
          headers: headersStr,
          statusCode: results.status
        }
      };

      const wafKeywords = ['cloudflare', 'sucuri', 'akamai', 'imperva'];
      const hasWaf = wafKeywords.some(kw => headersStr.includes(kw));

      if (results.status === 403 || results.status === 406 || results.status === 429 || hasWaf && results.status >= 400) {
        results.availabilityAnalysis.status = "Blocked";
        results.availabilityAnalysis.root_cause_analysis = `Status code ${results.status} or WAF headers detected. The server is online but actively blocking the request.`;
        results.availabilityAnalysis.user_action = "The tool's IP is being blocked by a firewall or anti-bot system. Please whitelist our tool's IP ranges with your host or WAF provider.";
      } else if (results.status >= 500) {
        results.availabilityAnalysis.status = "Server_Error";
        results.availabilityAnalysis.root_cause_analysis = `The server returned a ${results.status} error, struggling to process the request.`;
        results.availabilityAnalysis.user_action = "The server is failing to respond. If the page also fails to load in your personal browser, contact your hosting provider's technical support to investigate server resource limits or downtime.";
      } else if (results.status >= 400) {
        // e.g. 404 Not Found
        results.availabilityAnalysis.status = "Client_Error";
        results.availabilityAnalysis.root_cause_analysis = `The server returned a ${results.status} client error.`;
        results.availabilityAnalysis.user_action = "Verify the URL exists or check for broken links.";
      }

      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const $ = cheerio.load(html);

        // Meta tags
        results.meta.title = $('title').text();
        results.meta.description = $('meta[name="description"]').attr('content');
        results.meta.canonical = $('link[rel="canonical"]').attr('href');

        // Headings (Semantic chunking)
        const h1s = $('h1').length;
        const h2s = $('h2').length;
        results.headings.hasH1 = h1s === 1;
        results.headings.h1Count = h1s;
        results.headings.h2Count = h2s;

        // Schema extraction
        $('script[type="application/ld+json"]').each((i, el) => {
          try {
            const json = JSON.parse($(el).html());
            results.schema.found = true;
            if (Array.isArray(json)) {
               results.schema.types.push(...json.map(j => j['@type']));
            } else {
               results.schema.types.push(json['@type']);
            }
          } catch (e) {
            // ignore parsing errors
          }
        });
      }

    } catch (e) {
      results.status = 500;
      results.availabilityAnalysis = {
        status: "Server_Error",
        root_cause_analysis: "The connection timed out completely or the server is unreachable.",
        user_action: "The server is failing to respond. If the page also fails to load in your personal browser, contact your hosting provider's technical support to investigate server resource limits or downtime.",
        rawData: {
          responseTime: "Timeout (>10000ms)",
          headers: "None",
          statusCode: 500
        }
      };
    }

    // 2. Optional: Domain-level infrastructure checks (only run on first URL)
    if (analyzeDomainInfrastructure) {
      results.robots = { aiAllowed: true, sitemapUrl: null };
      results.llms = { found: false };

      try {
        const robotsRes = await fetch(`${domainUrl}/robots.txt`);
        if (robotsRes.ok) {
          const robotsTxt = await robotsRes.text();
          if (robotsTxt.includes('User-agent: OAI-SearchBot') && robotsTxt.includes('Disallow: /')) {
            results.robots.aiAllowed = false;
          }
          const sitemapMatch = robotsTxt.match(/Sitemap:\s*(.+)/i);
          if (sitemapMatch) {
            results.robots.sitemapUrl = sitemapMatch[1];
          }
        }
      } catch (e) {
        console.error("robots.txt fetch error:", e);
      }

      try {
        const llmsRes = await fetch(`${domainUrl}/llms.txt`);
        if (llmsRes.ok && llmsRes.headers.get('content-type')?.includes('text')) {
          results.llms.found = true;
        }
      } catch (e) {
        console.error("llms.txt fetch error:", e);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Audit API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
