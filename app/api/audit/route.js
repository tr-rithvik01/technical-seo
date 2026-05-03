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

      const xRobotsTag = htmlRes.headers.get('x-robots-tag') || '';
      results.meta.aiDirectives = {
        hasNoaiHeader: xRobotsTag.toLowerCase().includes('noai') || xRobotsTag.toLowerCase().includes('noimageai'),
        hasNoaiMeta: false,
        hasGooglebotNoindex: false
      };

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

        const robotsMeta = $('meta[name="robots"]').attr('content') || '';
        const googlebotMeta = $('meta[name="googlebot"]').attr('content') || '';
        results.meta.aiDirectives.hasNoaiMeta = robotsMeta.toLowerCase().includes('noai') || robotsMeta.toLowerCase().includes('noimageai');
        results.meta.aiDirectives.hasGooglebotNoindex = googlebotMeta.toLowerCase().includes('noindex');

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
      results.robots = { present: false, status: null, sitemapUrl: null, aiGovernance: null, checks: [] };
      results.llms = { found: false };

      try {
        const robotsRes = await fetch(`${domainUrl}/robots.txt`);
        results.robots.status = robotsRes.status;
        
        // 1. Root Directory Check
        if (robotsRes.ok) {
          results.robots.present = true;
          results.robots.checks.push({
            id: "r_root",
            name: "Robots.txt Root Location",
            status: "Pass",
            analysis: "The robots.txt file was successfully found in the root directory with a 200 OK status.",
            actionable_steps: "No action required."
          });
          
          const robotsTxt = await robotsRes.text();

          // AI Bot Governance (r2)
          results.robots.aiGovernance = { bots: {}, strategy: 'Undefined (Default Open)' };
          const aiBots = [
            { name: 'GPTBot', type: 'Training' },
            { name: 'Google-Extended', type: 'Training' },
            { name: 'CCBot', type: 'Training' },
            { name: 'anthropic-ai', type: 'Training' },
            { name: 'OAI-SearchBot', type: 'Search/Retrieval' },
            { name: 'ClaudeBot', type: 'Search/Retrieval' },
            { name: 'PerplexityBot', type: 'Search/Retrieval' }
          ];

          function getBotPermission(txt, botName, globalBlock) {
            const regex = new RegExp(`User-agent:\\s*${botName}(.*?)(?:User-agent:|$)`, 'is');
            const match = txt.match(regex);
            if (match) {
              const block = match[1];
              if (/^Disallow:\s*\/\s*$/im.test(block)) return { status: "DISALLOWED", explicit: true };
              return { status: "ALLOWED", explicit: true };
            }
            return { status: globalBlock ? "DISALLOWED" : "ALLOWED", explicit: false };
          }
          
          let globalBlockFound = false;
          const blocks = robotsTxt.split(/User-agent:/i);
          for (let block of blocks) {
             if (block.trim().startsWith('*')) {
                if (/^Disallow:\s*\/\s*$/im.test(block)) {
                   globalBlockFound = true;
                   break;
                }
             }
          }

          let trainingBlocked = false;
          let searchBlocked = false;
          let hasExplicitRules = false;

          for (const bot of aiBots) {
            const perm = getBotPermission(robotsTxt, bot.name, globalBlockFound);
            results.robots.aiGovernance.bots[bot.name] = { type: bot.type, status: perm.status, explicit: perm.explicit };
            if (perm.explicit) hasExplicitRules = true;
            if (perm.status === "DISALLOWED") {
              if (bot.type === 'Training') trainingBlocked = true;
              if (bot.type === 'Search/Retrieval') searchBlocked = true;
            }
          }

          if (globalBlockFound) {
            results.robots.aiGovernance.strategy = "AI-Closed";
          } else if (trainingBlocked && !searchBlocked) {
            results.robots.aiGovernance.strategy = "AI-Restrictive";
          } else if (searchBlocked && trainingBlocked) {
            results.robots.aiGovernance.strategy = "AI-Closed";
          } else if (hasExplicitRules && !trainingBlocked && !searchBlocked) {
            results.robots.aiGovernance.strategy = "AI-Open";
          }

          
          // 5. Sitemap URL Check
          const sitemapMatch = robotsTxt.match(/Sitemap:\s*(.+)/i);
          if (sitemapMatch) {
            results.robots.sitemapUrl = sitemapMatch[1];
            results.robots.checks.push({
              id: "r_sitemap",
              name: "XML Sitemap Declaration",
              status: "Pass",
              analysis: `A sitemap was declared: ${sitemapMatch[1]}. This gives Googlebot a headstart in knowing the structure of your site.`,
              actionable_steps: "No action required."
            });
          } else {
             results.robots.checks.push({
               id: "r_sitemap",
               name: "XML Sitemap Declaration",
               status: "Warning",
               analysis: "No XML Sitemap URL was found in your robots.txt file. While not strictly an error, omitting it misses an opportunity to guide crawlers to your important pages.",
               actionable_steps: "Add a line like `Sitemap: https://yourdomain.com/sitemap.xml` to the bottom of your robots.txt file."
             });
          }

          // 6. Global Block Check
          if (globalBlockFound) {
             results.robots.checks.push({
               id: "r_global",
               name: "Global Block (Dev Site Access)",
               status: "Fail",
               analysis: "A universal user-agent block (`User-agent: * Disallow: /`) was detected. This completely stops all compliant search engines from crawling and indexing your website.",
               actionable_steps: "If this is a live production site, immediately remove the `Disallow: /` line to restore search visibility. This instruction is only appropriate for staging or development environments."
             });
          } else {
             results.robots.checks.push({
               id: "r_global",
               name: "Global Block (Dev Site Access)",
               status: "Pass",
               analysis: "No universal blocking directives were found. Search engines are allowed to crawl the site.",
               actionable_steps: "No action required."
             });
          }

          // 3. Noindex Directive Check
          if (/Noindex:/i.test(robotsTxt)) {
             results.robots.checks.push({
               id: "r_noindex",
               name: "Deprecated Noindex Directive",
               status: "Warning",
               analysis: "Google officially stopped obeying `Noindex` instructions in robots.txt as of September 2019. Any pages you are trying to hide using this method may still be indexed.",
               actionable_steps: "Remove the `Noindex` directive from robots.txt. Instead, use the `robots` meta tag (`<meta name=\"robots\" content=\"noindex\">`) in the HTML head or an `X-Robots-Tag` HTTP header on the specific pages you want hidden."
             });
          } else {
             results.robots.checks.push({
               id: "r_noindex",
               name: "Deprecated Noindex Directive",
               status: "Pass",
               analysis: "No deprecated `Noindex` directives were found in the file.",
               actionable_steps: "No action required."
             });
          }

          // 8. Crawl-delay Check
          if (/Crawl-delay:/i.test(robotsTxt)) {
             results.robots.checks.push({
               id: "r_crawldelay",
               name: "Unsupported Crawl-delay",
               status: "Warning",
               analysis: "A `Crawl-delay` directive was found. Googlebot does not support or obey this directive. While Bing does support it, relying on it for Google will not throttle their crawl rate.",
               actionable_steps: "You can leave it for Bing, but be aware it will not affect Googlebot. If server load from Google is an issue, you must configure server-side rate limiting."
             });
          } else {
             results.robots.checks.push({
               id: "r_crawldelay",
               name: "Unsupported Crawl-delay",
               status: "Pass",
               analysis: "No unsupported `Crawl-delay` directives were found.",
               actionable_steps: "No action required."
             });
          }

          // 4. Blocked Critical Resources Check
          const blockedResources = ['/css/', '/js/', '/assets/', '/wp-includes/'];
          const blockedFound = blockedResources.filter(res => new RegExp(`Disallow:\\s*${res}`, 'i').test(robotsTxt));
          if (blockedFound.length > 0) {
             results.robots.checks.push({
               id: "r_resources",
               name: "Blocked Scripts and Stylesheets",
               status: "Warning",
               analysis: `Crawler access to critical resource directories (${blockedFound.join(', ')}) appears to be blocked. Googlebot needs access to CSS and JS files to render and understand your pages correctly.`,
               actionable_steps: "Remove the disallow rules for these directories, or insert specific `Allow` exceptions for the necessary CSS and JavaScript files to ensure proper rendering."
             });
          } else {
             results.robots.checks.push({
               id: "r_resources",
               name: "Blocked Scripts and Stylesheets",
               status: "Pass",
               analysis: "Common critical resource directories (CSS/JS) are not explicitly blocked.",
               actionable_steps: "No action required."
             });
          }

          // 7. Absolute URLs Check
          const lines = robotsTxt.split('\n');
          const absoluteUrlRegex = /^(Allow|Disallow):\s*(http:\/\/|https:\/\/)/i;
          const absoluteUrlsFound = lines.filter(line => absoluteUrlRegex.test(line.trim()));
          if (absoluteUrlsFound.length > 0) {
             results.robots.checks.push({
               id: "r_absolute",
               name: "Using Absolute URLs",
               status: "Warning",
               analysis: "Absolute URLs (starting with http/https) were found in Allow/Disallow rules. Google's documentation specifies that paths should be relative to the root domain. Absolute URLs might be misinterpreted or ignored.",
               actionable_steps: `Change absolute URLs to relative paths. For example, change \`${absoluteUrlsFound[0].trim()}\` to use a relative path like \`Disallow: /path/\`.`
             });
          } else {
             results.robots.checks.push({
               id: "r_absolute",
               name: "Using Absolute URLs",
               status: "Pass",
               analysis: "All Allow/Disallow rules use proper relative paths.",
               actionable_steps: "No action required."
             });
          }

          // 2. Overbroad Wildcard Check
          const wildcardRegex = /Disallow:.*[\*\$]/i;
          if (wildcardRegex.test(robotsTxt)) {
             results.robots.checks.push({
               id: "r_wildcard",
               name: "Poor Use of Wildcards",
               status: "Warning",
               analysis: "Wildcard characters (* or $) are used in Disallow rules. While valid, a poorly placed asterisk can inadvertently block access to large portions of your site.",
               actionable_steps: "Review your wildcard rules carefully. Test them using a robots.txt testing tool to ensure they only block the exact URLs intended."
             });
          } else {
             results.robots.checks.push({
               id: "r_wildcard",
               name: "Poor Use of Wildcards",
               status: "Pass",
               analysis: "No wildcard characters (* or $) are used in Disallow rules, minimizing the risk of accidental blocking.",
               actionable_steps: "No action required."
             });
          }

        } else {
           results.robots.checks.push({
             id: "r_root",
             name: "Robots.txt Root Location",
             status: "Fail",
             analysis: `Search robots can only discover the file if it's in your root folder, but a ${robotsRes.status} error was returned. Your website is behaving as if there is no robots.txt file.`,
             actionable_steps: "Create a valid robots.txt file and upload it to the root directory of your server (e.g., yourdomain.com/robots.txt)."
           });
        }
      } catch (e) {
        console.error("robots.txt fetch error:", e);
        results.robots.checks.push({
          id: "r_root",
          name: "Robots.txt Root Location",
          status: "Fail",
          analysis: "Failed to fetch robots.txt due to a network or connection error. The server may be blocking the request.",
          actionable_steps: "Check server configurations, firewalls, or WAFs that might be blocking access to the robots.txt file."
        });
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
