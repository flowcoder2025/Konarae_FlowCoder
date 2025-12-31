import { NextResponse } from "next/server";

const WEBHOOK_URL =
  "https://jerome87.com/webhook/176a6de9-064d-4015-9ea7-b674919b6e1a";

interface SupportRequest {
  category: string;
  categoryTitle: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  submittedAt: string;
}

export async function POST(request: Request) {
  try {
    const body: SupportRequest = await request.json();

    // Validate required fields
    if (!body.name || !body.email || !body.category || !body.message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Send to webhook
    const webhookResponse = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: body.category,
        categoryTitle: body.categoryTitle,
        name: body.name,
        email: body.email,
        phone: body.phone || "",
        message: body.message,
        submittedAt: body.submittedAt,
        source: "FlowMate",
      }),
    });

    if (!webhookResponse.ok) {
      console.error("Webhook failed:", await webhookResponse.text());
      return NextResponse.json(
        { error: "Failed to send inquiry" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Support API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
