/**
 * Playwright Browser Helper for WAF Bypass
 *
 * WAF/Cloudflare로 차단되는 사이트에 대해 실제 브라우저를 사용하여 크롤링
 *
 * 사용 사례:
 * - ERR_BAD_REQUEST 에러 발생 시 fallback
 * - JavaScript 렌더링이 필요한 SPA 사이트
 * - WAF/Cloudflare 보호가 있는 사이트
 */

import { chromium, Browser, Page, BrowserContext } from "playwright";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "playwright-browser" });

// 싱글톤 브라우저 인스턴스
let browserInstance: Browser | null = null;
let browserContext: BrowserContext | null = null;

/**
 * WAF 차단 도메인 목록
 * 이 도메인들은 axios 대신 Playwright로 크롤링
 */
export const WAF_BLOCKED_DOMAINS = [
  "gdtp.or.kr",       // 경기대진테크노파크 (gdtpi → gdtp 변경)
  "gntp.or.kr",       // 경남테크노파크
  "gbtp.or.kr",       // 경북테크노파크
  "gjtp.or.kr",       // 광주테크노파크 (JS 렌더링 필요)
  "dgtp.or.kr",       // 대구테크노파크
  "djtp.or.kr",       // 대전테크노파크 (JS 렌더링 필요)
  "sjtp.or.kr",       // 세종테크노파크 (JS 렌더링 필요)
  "utp.or.kr",        // 울산테크노파크
  "jntp.or.kr",       // 전남테크노파크
  "jejutp.or.kr",     // 제주테크노파크
  "ptp.or.kr",        // 포항테크노파크
  "ctp.or.kr",        // 충남테크노파크 (JS 렌더링 필요)
];

/**
 * URL이 WAF 차단 도메인인지 확인
 */
export function isWafBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return WAF_BLOCKED_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * 브라우저 초기화 (싱글톤)
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    logger.info("Launching Playwright browser...");

    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    // 브라우저 컨텍스트 생성 (쿠키/세션 유지)
    browserContext = await browserInstance.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      extraHTTPHeaders: {
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
      },
    });

    logger.info("Playwright browser launched successfully");
  }

  return browserInstance;
}

/**
 * 브라우저 컨텍스트 가져오기
 */
async function getBrowserContext(): Promise<BrowserContext> {
  await getBrowser();

  if (!browserContext) {
    throw new Error("Browser context not initialized");
  }

  return browserContext;
}

/**
 * Playwright를 사용하여 페이지 HTML 가져오기
 *
 * @param url 크롤링할 URL
 * @param options 옵션
 * @returns HTML 콘텐츠와 쿠키
 */
export async function fetchWithPlaywright(
  url: string,
  options: {
    timeout?: number;
    waitForSelector?: string;
    waitForLoadState?: "load" | "domcontentloaded" | "networkidle";
  } = {}
): Promise<{ html: string; cookies: string }> {
  const {
    timeout = 30000,
    waitForLoadState = "domcontentloaded",
  } = options;

  const context = await getBrowserContext();
  const page = await context.newPage();

  try {
    logger.info(`[Playwright] Navigating to: ${url}`);

    // 페이지 이동
    const response = await page.goto(url, {
      timeout,
      waitUntil: waitForLoadState,
    });

    if (!response) {
      throw new Error("No response received");
    }

    const status = response.status();
    logger.debug(`[Playwright] Response status: ${status}`);

    // Cloudflare 체크 대기 (필요시)
    // 일부 사이트는 초기 JS 실행 후 콘텐츠가 로드됨
    await page.waitForTimeout(1000);

    // 추가 대기가 필요한 경우 (테이블 로드 등)
    if (options.waitForSelector) {
      try {
        await page.waitForSelector(options.waitForSelector, { timeout: 5000 });
      } catch {
        logger.debug(`[Playwright] Selector "${options.waitForSelector}" not found, continuing...`);
      }
    }

    // HTML 가져오기
    const html = await page.content();

    // 일부 사이트는 404/500 상태를 반환하면서도 실제 콘텐츠를 보여줌
    // (예: 경남테크노파크 gntp.or.kr)
    // 따라서 상태 코드만으로 실패 판단하지 않고 콘텐츠 검증
    if (status >= 400) {
      const hasTable = html.includes("<table");
      const hasContent = html.length > 10000; // 10KB 이상
      const isErrorPage = html.toLowerCase().includes("error") && html.length < 5000;

      if (isErrorPage || (!hasTable && !hasContent)) {
        throw new Error(`HTTP ${status}: ${response.statusText()}`);
      }
      logger.debug(`[Playwright] Status ${status} but has content (${html.length} bytes), continuing...`);
    }

    // 쿠키 추출
    const cookies = await context.cookies();
    const cookieString = cookies
      .map(c => `${c.name}=${c.value}`)
      .join("; ");

    logger.info(`[Playwright] Successfully fetched ${url} (${html.length} bytes)`);

    return { html, cookies: cookieString };
  } catch (error: any) {
    logger.error(`[Playwright] Failed to fetch ${url}`, { error: error.message });
    throw error;
  } finally {
    await page.close();
  }
}

/**
 * Playwright를 사용하여 파일 다운로드
 *
 * @param url 다운로드 URL
 * @param referer Referer URL
 * @param cookies 쿠키 문자열
 * @returns 파일 버퍼와 파일명
 */
export async function downloadWithPlaywright(
  url: string,
  referer?: string,
  cookies?: string
): Promise<{ buffer: Buffer; fileName: string | null }> {
  const context = await getBrowserContext();
  const page = await context.newPage();

  try {
    // Referer 설정
    if (referer) {
      await page.setExtraHTTPHeaders({ Referer: referer });
    }

    // 쿠키 설정
    if (cookies) {
      const cookiePairs = cookies.split("; ").map(pair => {
        const [name, value] = pair.split("=");
        const domain = new URL(url).hostname;
        return { name, value, domain, path: "/" };
      });
      await context.addCookies(cookiePairs);
    }

    logger.debug(`[Playwright] Downloading: ${url}`);

    // 다운로드 이벤트 대기
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.goto(url),
    ]);

    // 파일 저장
    const filePath = await download.path();
    if (!filePath) {
      throw new Error("Download failed - no file path");
    }

    const fs = await import("fs/promises");
    const buffer = await fs.readFile(filePath);
    const fileName = download.suggestedFilename();

    logger.info(`[Playwright] Downloaded: ${fileName} (${buffer.length} bytes)`);

    return { buffer, fileName };
  } catch (error: any) {
    logger.error(`[Playwright] Download failed: ${url}`, { error: error.message });
    throw error;
  } finally {
    await page.close();
  }
}

/**
 * 브라우저 종료
 */
export async function closeBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close();
    browserContext = null;
  }

  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    logger.info("Playwright browser closed");
  }
}

/**
 * 프로세스 종료 시 브라우저 정리
 */
process.on("exit", () => {
  if (browserInstance) {
    browserInstance.close().catch(() => {});
  }
});

process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});
