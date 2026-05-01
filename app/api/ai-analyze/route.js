import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { rawData, issueDescription } = await req.json();

    const token = process.env.AIPIPE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "AIPIPE_TOKEN is not configured in .env.local" },
        { status: 500 }
      );
    }

    const prompt = `You are an expert Technical SEO and Server Diagnostics Agent. 
    Analyze the following raw HTTP diagnostic data from a website crawl that was flagged for the following issue: "${issueDescription}"
    
    Raw Data:
    ${JSON.stringify(rawData, null, 2)}
    
    Based on this data, provide:
    1. A deep-dive root cause analysis.
    2. Specific, actionable next steps for the site owner to resolve this availability issue.
    Keep your response concise, technical, and directly addressing the data provided. Format it cleanly in Markdown.`;

    const res = await fetch("https://aipipe.org/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano-2025-04-14",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AI Pipe API Error: ${err}`);
    }

    const data = await res.json();
    return NextResponse.json({ analysis: data.choices[0].message.content });
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate AI analysis" }, { status: 500 });
  }
}
