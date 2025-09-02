import { chromium, Browser, Page } from "playwright";

let browserP: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserP) {
    browserP = chromium.launch({
      headless: false,                 // headed per requirement
      args: ["--disable-dev-shm-usage"]
    }).then(b => {
      console.log("[browser] launched");
      return b;
    });
  }
  return browserP;
}

export async function newPage(): Promise<Page> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  return ctx.newPage();
}
