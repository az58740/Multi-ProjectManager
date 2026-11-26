import { generateText, stepCountIs, tool } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1600) })).min(1).max(12),
  locale: z.enum(["fa", "en"]).default("fa"),
});

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  if (!cookie) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const sessionResponse = await fetch(new URL("/api/v1/auth/session", request.url), {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!sessionResponse.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const session: unknown = await sessionResponse.json();
    if (!session || typeof session !== "object" || !("authenticated" in session) || session.authenticated !== true || !("authorized" in session) || session.authorized !== true) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const userName = "user" in session && session.user && typeof session.user === "object" && "name" in session.user && typeof session.user.name === "string"
      ? session.user.name
      : "";

    const parsedBody = requestSchema.safeParse(await request.json());
    if (!parsedBody.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const { messages, locale } = parsedBody.data;
    let requestedAction: { type: "navigate"; section: "overview" | "accounts" | "catalog" | "financial" } | { type: "search"; query: string } | null = null;

    const result = await generateText({
      model: "google/gemini-3-flash",
      system: locale === "fa"
        ? `تو دستیار هوشمند فارسی‌زبان سامانه مدیریت پروژه هستی. فارسی را پیش‌فرض بگیر و کاربر را با نام «${userName || "کاربر"}» خطاب کن. انگلیسی را هم اگر کاربر انگلیسی نوشت، روان پاسخ بده. به منوها و قابلیت‌های سامانه مسلطی: نمای کلی پروژه‌ها، حساب‌ها، منابع/کاتالوگ و امور مالی. برای جابه‌جایی بین این بخش‌ها از ابزار navigate استفاده کن. برای فیلتر پروژه‌ها ابزار search را به کار ببر. برای پاسخ دقیق درباره فهرست پروژه‌ها از ابزار listProjects استفاده کن. هیچ تغییری در داده‌ها انجام نده و هیچ API تغییردهنده‌ای را اجرا نکن؛ فقط توضیح بده کاربر از فرم‌های برنامه استفاده کند. اگر عملیاتی در دسترس ابزارها نیست، صادقانه بگو. متن را کوتاه و روشن بنویس.`
        : `You are the Persian/English AI assistant for a project management system. Address the user by name: ${userName || "user"}. Reply in the language they used. You understand the overview, accounts, catalog/resources, and finance sections. Use navigate to switch sections, search to filter projects, and listProjects to answer factual questions about projects. Never modify data or execute write APIs; direct the user to the app's forms instead. Be honest when an operation is unavailable. Keep replies concise.`,
      messages,
      tools: {
        navigate: tool({
          description: "Open a section in the project dashboard when the user asks to navigate there.",
          inputSchema: z.object({ section: z.enum(["overview", "accounts", "catalog", "financial"]) }),
          execute: async ({ section }) => {
            requestedAction = { type: "navigate", section };
            return { opened: section };
          },
        }),
        search: tool({
          description: "Filter the visible project list by a name, code, location, or keyword the user mentioned.",
          inputSchema: z.object({ query: z.string().trim().min(1).max(100) }),
          execute: async ({ query }) => {
            requestedAction = { type: "search", query };
            return { filteredBy: query };
          },
        }),
        listProjects: tool({
          description: "Get the current user's project names, codes, types, and statuses to answer questions about their projects.",
          inputSchema: z.object({}),
          execute: async () => {
            const projectsResponse = await fetch(new URL("/api/v1/projects", request.url), {
              headers: { cookie },
              cache: "no-store",
              signal: AbortSignal.timeout(8_000),
            });
            if (!projectsResponse.ok) throw new Error("Project list is unavailable");
            const payload: unknown = await projectsResponse.json();
            if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) return { projects: [] };
            const projects = payload.items.slice(0, 100).flatMap((item: unknown) => {
              if (!item || typeof item !== "object") return [];
              const project = item as Record<string, unknown>;
              return typeof project.name === "string" && typeof project.code === "string"
                ? [{ name: project.name, code: project.code, type: project.type, status: project.status }]
                : [];
            });
            return { projects };
          },
        }),
      },
      stopWhen: stepCountIs(4),
    });

    return NextResponse.json({ reply: result.text || (locale === "fa" ? "انجام شد." : "Done."), action: requestedAction });
  } catch {
    return NextResponse.json({ error: "assistant_unavailable" }, { status: 503 });
  }
}
