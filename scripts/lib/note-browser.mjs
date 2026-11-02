/*
 * 本地作品观察：共享的浏览器启动与清理。
 * 只复用工程现有的 playwright-core 与本机浏览器；不安装包、不下载浏览器、不启动服务。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LIBRARY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const DEFAULT_EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const EXTERNAL_SCHEME = /^(?:https?|wss?):/i;

function coded(code, message, extra) {
  const error = new Error(message);
  error.code = code;
  if (extra) Object.assign(error, extra);
  return error;
}

export function resolveBrowserExecutable(root = LIBRARY_ROOT, explicit = null) {
  const requested = explicit || process.env.NOTE_BROWSER || DEFAULT_EDGE;
  const resolved = path.resolve(requested);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw coded('missing_browser', '找不到浏览器可执行文件：' + resolved +
      '。请用 --browser <可执行文件绝对路径> 指定本机已安装的 Edge/Chrome；本工具不自动安装或下载浏览器。');
  }
  return resolved;
}

export function loadPlaywright(root = LIBRARY_ROOT) {
  const packageFile = path.join(root, 'tests', 'tools', 'package.json');
  if (!fs.existsSync(packageFile)) {
    throw coded('missing_playwright', '找不到工程现成的 tests/tools/package.json；本工具不自动安装依赖。');
  }
  try {
    const require = createRequire(packageFile);
    const playwright = require('playwright-core');
    if (!playwright || !playwright.chromium) throw new Error('playwright-core 没有 chromium 导出');
    return playwright;
  } catch (error) {
    throw coded('missing_playwright', '无法加载工程现有 playwright-core（tests/tools/node_modules）。' +
      '请先按工程既有方式准备 tests/tools 依赖，本工具不自动执行安装。原始错误：' + error.message);
  }
}

function normalizeEntry(entry) {
  if (!entry) throw coded('invalid_entry', '需要一个本地成品 HTML 路径。');
  const resolved = path.resolve(String(entry));
  if (!fs.existsSync(resolved)) throw coded('invalid_entry', '成品 HTML 不存在：' + resolved);
  if (!fs.statSync(resolved).isFile()) throw coded('invalid_entry', '成品路径不是文件：' + resolved);
  if (!/\.html?$/i.test(resolved)) throw coded('invalid_entry', '成品路径不是 HTML 文件：' + resolved);
  return resolved;
}

function positiveInteger(value, fallback, name) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw coded('usage', name + ' 必须是正整数。');
  return number;
}

export async function openNotePage(options = {}) {
  const root = options.root || LIBRARY_ROOT;
  const entry = normalizeEntry(options.entry);
  const executablePath = resolveBrowserExecutable(root, options.browser);
  const playwright = loadPlaywright(root);
  const width = positiveInteger(options.width, 1440, '--width');
  const height = positiveInteger(options.height, 1000, '--height');
  const headless = options.headless !== false;
  const observations = {
    pageErrors: [],
    consoleErrors: [],
    externalRequests: [],
    requestFailures: []
  };
  let browser = null;
  let context = null;
  let page = null;
  let closed = false;

  async function close() {
    if (closed) return;
    closed = true;
    try { if (context) await context.close(); } catch (error) { /* 浏览器可能已退出 */ }
    try { if (browser) await browser.close(); } catch (error) { /* 浏览器可能已退出 */ }
  }

  try {
    browser = await playwright.chromium.launch({ executablePath, headless });
    context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.on('pageerror', (error) => {
      observations.pageErrors.push({ message: error && error.message ? error.message : String(error) });
    });
    page.on('console', (message) => {
      if (message.type() === 'error') observations.consoleErrors.push({ text: message.text(), location: message.location() });
    });
    page.on('request', (request) => {
      const url = request.url();
      if (EXTERNAL_SCHEME.test(url)) observations.externalRequests.push({ url, method: request.method(), resourceType: request.resourceType() });
    });
    page.on('requestfailed', (request) => {
      observations.requestFailures.push({
        url: request.url(),
        method: request.method(),
        failure: request.failure() ? request.failure().errorText : 'unknown'
      });
    });
    await page.goto(pathToFileURL(entry).href, { waitUntil: 'load', timeout: options.timeout || 30000 });
    // 让首次布局与初始渲染完成，但不固定等待某个作品时长；作品专属检查由 probe 负责。
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return { browser, context, page, observations, entry, viewport: { width, height }, close };
  } catch (error) {
    await close();
    if (error && error.code) throw error;
    throw coded('open_failed', '打开本地成品失败：' + (error && error.message ? error.message : String(error)), { cause: error });
  }
}
