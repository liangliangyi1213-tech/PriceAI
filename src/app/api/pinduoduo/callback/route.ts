export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseInit = {
  headers: {
    "Cache-Control": "no-store",
  },
};

export async function GET(request: Request): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;

  if (searchParams.has("error")) {
    return Response.json(
      {
        success: false,
        message: "拼多多授权失败。",
      },
      { ...responseInit, status: 400 },
    );
  }

  const code = searchParams.get("code")?.trim();
  if (!code) {
    return Response.json(
      {
        success: false,
        message: "缺少授权 code。",
      },
      { ...responseInit, status: 400 },
    );
  }

  return Response.json(
    {
      success: true,
      message: "PriceAI 已成功接收到拼多多授权回调。",
      callbackReceived: true,
      stateReceived: searchParams.has("state"),
    },
    responseInit,
  );
}
