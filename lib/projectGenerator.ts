// lib/projectGenerator.ts
// Generates complete IDE-ready project structures

export interface ProjectFile {
  path: string;
  content: string;
}

export interface ProjectOptions {
  workflowTitle: string;
  framework: string;
  structure: "simple" | "pom";
  steps: any[];
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
}

function getSelector(target: any, framework: string): string {
  if (!target) return framework.includes("selenium") ? '"body"' : "'body'";
  if (target.data_testid) {
    if (framework.includes("playwright") || framework.includes("cypress")) return `'[data-testid="${target.data_testid}"]'`;
    if (framework === "selenium-py") return `By.CSS_SELECTOR, '[data-testid="${target.data_testid}"]'`;
    if (framework === "selenium-java") return `By.cssSelector("[data-testid=\\"${target.data_testid}\\"]")`;
  }
  if (target.aria_label) {
    if (framework.includes("playwright") || framework.includes("cypress")) return `'[aria-label="${target.aria_label}"]'`;
    if (framework === "selenium-py") return `By.XPATH, '//*[@aria-label="${target.aria_label}"]'`;
    if (framework === "selenium-java") return `By.xpath("//*[@aria-label=\\"${target.aria_label}\\"]")`;
  }
  if (target.id) {
    if (framework.includes("playwright") || framework.includes("cypress")) return `'#${target.id}'`;
    if (framework === "selenium-py") return `By.ID, '${target.id}'`;
    if (framework === "selenium-java") return `By.id("${target.id}")`;
  }
  if (target.css_selector) {
    if (framework.includes("playwright") || framework.includes("cypress")) return `'${target.css_selector}'`;
    if (framework === "selenium-py") return `By.CSS_SELECTOR, '${target.css_selector}'`;
    if (framework === "selenium-java") return `By.cssSelector("${target.css_selector}")`;
  }
  if (target.xpath_robust) {
    if (framework.includes("playwright")) return `'xpath=${target.xpath_robust}'`;
    if (framework === "selenium-py") return `By.XPATH, '${target.xpath_robust}'`;
    if (framework === "selenium-java") return `By.xpath("${target.xpath_robust}")`;
  }
  return framework.includes("selenium") ? `By.TAG_NAME, "body"` : "'body'";
}

function getSelectorComment(target: any): string {
  if (!target) return "";
  if (target.data_testid) return `// Selector: data-testid (most stable)`;
  if (target.aria_label) return `// Selector: aria-label (semantic)`;
  if (target.id) return `// Selector: id`;
  if (target.css_selector) return `// Selector: CSS (least stable — consider adding data-testid)`;
  return `// Selector: xpath (fragile — add data-testid to this element)`;
}

// Smart step converter for Playwright
function stepToPlaywrightLines(step: any, indent: string): string[] {
  const lines: string[] = [];
  const sel = getSelector(step.target, "playwright-js");
  const comment = getSelectorComment(step.target);
  const label = `Step ${step.sequence}: ${step.type}${step.pageTitle ? ` on "${step.pageTitle}"` : ""}`;

  lines.push(`${indent}// ${label}`);

  switch (step.type) {
    case "navigate":
      lines.push(`${indent}await page.goto('${step.url}');`);
      lines.push(`${indent}await page.waitForLoadState('networkidle');`);
      break;

    case "click":
      if (comment) lines.push(`${indent}${comment}`);
      lines.push(`${indent}await page.locator(${sel}).first().waitFor({ state: 'visible' });`);
      lines.push(`${indent}await page.locator(${sel}).first().click();`);
      // If this click caused a navigation
      if (step.navigated_to) {
        lines.push(`${indent}await page.waitForURL('${step.navigated_to}', { timeout: 10000 });`);
        lines.push(`${indent}await page.waitForLoadState('networkidle');`);
      } else {
        lines.push(`${indent}await page.waitForLoadState('domcontentloaded');`);
      }
      break;

    case "dblclick":
      if (comment) lines.push(`${indent}${comment}`);
      lines.push(`${indent}await page.locator(${sel}).first().dblclick();`);
      lines.push(`${indent}await page.waitForLoadState('domcontentloaded');`);
      break;

    case "type": {
      const val = step.value === "__SECRET__"
        ? "process.env.SECRET || 'your_password'"
        : step.value || "";
      if (comment) lines.push(`${indent}${comment}`);
      lines.push(`${indent}await page.locator(${sel}).first().waitFor({ state: 'visible' });`);
      lines.push(`${indent}await page.locator(${sel}).first().clear();`);
      lines.push(`${indent}await page.locator(${sel}).first().fill('${val}');`);
      break;
    }

    case "select":
      if (comment) lines.push(`${indent}${comment}`);
      lines.push(`${indent}await page.locator(${sel}).first().selectOption('${step.value}');`);
      break;

    case "keypress":
      lines.push(`${indent}await page.keyboard.press('${step.key}');`);
      lines.push(`${indent}await page.waitForLoadState('domcontentloaded');`);
      break;

    case "scroll":
      lines.push(`${indent}await page.evaluate(() => window.scrollTo(${step.scrollX || 0}, ${step.scrollY || 0}));`);
      lines.push(`${indent}await page.waitForTimeout(300);`);
      break;

    case "drag_and_drop":
      if (step.source && step.target) {
        const srcSel = getSelector(step.source, "playwright-js");
        const tgtSel = getSelector(step.target, "playwright-js");
        lines.push(`${indent}await page.dragAndDrop(${srcSel}, ${tgtSel});`);
        lines.push(`${indent}await page.waitForTimeout(500);`);
      }
      break;

    default:
      lines.push(`${indent}// ${step.type} — not yet supported`);
  }

  lines.push("");
  return lines;
}

function groupStepsByPage(steps: any[]) {
  const pages: { title: string; url: string; steps: any[] }[] = [];
  let current: { title: string; url: string; steps: any[] } | null = null;
  for (const step of steps) {
    if (step.type === "navigate" || !current) {
      if (current) pages.push(current);
      current = { title: step.pageTitle || "Page", url: step.url || "", steps: [] };
    }
    if (current) current.steps.push(step);
  }
  if (current) pages.push(current);
  return pages;
}

// ─── PLAYWRIGHT SIMPLE ────────────────────────────────────────────────────────

function generatePlaywrightSimple(opts: ProjectOptions): ProjectFile[] {
  const { workflowTitle, framework, steps } = opts;
  const isTs = framework === "playwright-ts";
  const ext = isTs ? "ts" : "js";
  const safeName = sanitizeName(workflowTitle);

  const lines: string[] = [];
  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Workflow: ${workflowTitle}`);
  lines.push(` * Generated by TraceDeck`);
  lines.push(` * Framework: Playwright (${isTs ? "TypeScript" : "JavaScript"})`);
  lines.push(` * Structure: Simple`);
  lines.push(` *`);
  lines.push(` * HOW TO RUN:`);
  lines.push(` *   1. npm install`);
  lines.push(` *   2. npx playwright install`);
  lines.push(` *   3. cp .env.example .env  (fill in your credentials)`);
  lines.push(` *   4. npx playwright test`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`test('${workflowTitle}', async ({ page }) => {`);
  lines.push(`  // Set default timeout for all actions`);
  lines.push(`  page.setDefaultTimeout(15000);`);
  lines.push(``);

  for (const step of steps) {
    const stepLines = stepToPlaywrightLines(step, "  ");
    stepLines.forEach(l => lines.push(l));
  }

  lines.push(`});`);

  return [
    {
      path: `tests/${safeName}.spec.${ext}`,
      content: lines.join("\n"),
    },
    {
      path: `playwright.config.${ext}`,
      content: `import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});`,
    },
    {
      path: "package.json",
      content: JSON.stringify({
        name: safeName.toLowerCase(),
        version: "1.0.0",
        description: `TraceDeck generated test: ${workflowTitle}`,
        scripts: {
          test: "playwright test",
          "test:headed": "playwright test --headed",
          "test:debug": "playwright test --debug",
          "test:report": "playwright show-report",
        },
        devDependencies: {
          "@playwright/test": "^1.40.0",
          "dotenv": "^16.0.0",
          ...(isTs ? { typescript: "^5.0.0" } : {}),
        },
      }, null, 2),
    },
    {
      path: ".env.example",
      content: `# Copy this to .env and fill in your values
# Never commit .env to git

SECRET=your_password_here
BASE_URL=https://your-app.com
`,
    },
    {
      path: ".gitignore",
      content: `node_modules/
.env
test-results/
playwright-report/
`,
    },
    {
      path: "README.md",
      content: `# ${workflowTitle}

Generated by [TraceDeck](https://tracedeck.io)

## Quick Start

\`\`\`bash
npm install
npx playwright install chromium
cp .env.example .env
# Edit .env — add your credentials
npm test
\`\`\`

## View Report After Run

\`\`\`bash
npm run test:report
\`\`\`

## Debug Mode (see browser)

\`\`\`bash
npm run test:debug
\`\`\`
`,
    },
  ];
}

// ─── PLAYWRIGHT POM ───────────────────────────────────────────────────────────

function generatePlaywrightPOM(opts: ProjectOptions): ProjectFile[] {
  const { workflowTitle, framework, steps } = opts;
  const isTs = framework === "playwright-ts";
  const ext = isTs ? "ts" : "js";
  const safeName = sanitizeName(workflowTitle);
  const pages = groupStepsByPage(steps);
  const files: ProjectFile[] = [];
  const pageNames = new Set<string>();

  for (const page of pages) {
    const pageName = sanitizeName(page.title) + "Page";
    if (pageNames.has(pageName)) continue;
    pageNames.add(pageName);

    const pageLines: string[] = [];
    if (isTs) pageLines.push(`import { Page, expect } from '@playwright/test';`);
    pageLines.push(``);
    pageLines.push(`/**`);
    pageLines.push(` * Page Object: ${page.title}`);
    pageLines.push(` * URL Pattern: ${page.url}`);
    pageLines.push(` * Generated by TraceDeck`);
    pageLines.push(` */`);

    if (isTs) {
      pageLines.push(`export class ${pageName} {`);
      pageLines.push(`  constructor(private readonly page: Page) {}`);
    } else {
      pageLines.push(`class ${pageName} {`);
      pageLines.push(`  constructor(page) { this.page = page; }`);
    }
    pageLines.push(``);

    pageLines.push(`  async navigate() {`);
    pageLines.push(`    await this.page.goto('${page.url}');`);
    pageLines.push(`    await this.page.waitForLoadState('networkidle');`);
    pageLines.push(`  }`);
    pageLines.push(``);

    pageLines.push(`  async waitForPageReady() {`);
    pageLines.push(`    await this.page.waitForLoadState('networkidle');`);
    pageLines.push(`  }`);
    pageLines.push(``);

    for (const step of page.steps) {
      if (step.type === "navigate") continue;
      const sel = getSelector(step.target, framework);
      const comment = getSelectorComment(step.target);
      const methodName = `${step.type}_${step.target?.text_content
        ? sanitizeName(step.target.text_content).slice(0, 20)
        : "step" + step.sequence}`;

      pageLines.push(`  // Step ${step.sequence}: ${step.type}`);
      if (comment) pageLines.push(`  ${comment}`);
      pageLines.push(`  async ${methodName}() {`);

      switch (step.type) {
        case "click":
          pageLines.push(`    await this.page.locator(${sel}).first().waitFor({ state: 'visible' });`);
          pageLines.push(`    await this.page.locator(${sel}).first().click();`);
          if (step.navigated_to) {
            pageLines.push(`    await this.page.waitForURL('${step.navigated_to}', { timeout: 10000 });`);
          }
          pageLines.push(`    await this.page.waitForLoadState('domcontentloaded');`);
          break;
        case "type": {
          const val = step.value === "__SECRET__" ? "process.env.SECRET || ''" : `'${step.value || ""}'`;
          pageLines.push(`    await this.page.locator(${sel}).first().waitFor({ state: 'visible' });`);
          pageLines.push(`    await this.page.locator(${sel}).first().clear();`);
          pageLines.push(`    await this.page.locator(${sel}).first().fill(${val});`);
          break;
        }
        case "select":
          pageLines.push(`    await this.page.locator(${sel}).first().selectOption('${step.value}');`);
          break;
        case "keypress":
          pageLines.push(`    await this.page.keyboard.press('${step.key}');`);
          break;
        case "scroll":
          pageLines.push(`    await this.page.evaluate(() => window.scrollTo(${step.scrollX || 0}, ${step.scrollY || 0}));`);
          break;
        default:
          pageLines.push(`    // ${step.type} not supported`);
      }

      pageLines.push(`  }`);
      pageLines.push(``);
    }

    pageLines.push(`}`);
    if (!isTs) pageLines.push(`module.exports = { ${pageName} };`);

    files.push({ path: `pages/${pageName}.${ext}`, content: pageLines.join("\n") });
  }

  // Test file
  const testLines: string[] = [];
  testLines.push(`import { test, expect } from '@playwright/test';`);
  Array.from(pageNames).forEach(name => {
    if (isTs) testLines.push(`import { ${name} } from '../pages/${name}';`);
    else testLines.push(`const { ${name} } = require('../pages/${name}');`);
  });
  testLines.push(``);
  testLines.push(`/**`);
  testLines.push(` * Workflow: ${workflowTitle}`);
  testLines.push(` * Structure: Page Object Model`);
  testLines.push(` * Generated by TraceDeck`);
  testLines.push(` */`);
  testLines.push(`test('${workflowTitle}', async ({ page }) => {`);
  testLines.push(`  page.setDefaultTimeout(15000);`);
  testLines.push(``);

  Array.from(pageNames).forEach(name => {
    const varName = name.charAt(0).toLowerCase() + name.slice(1);
    testLines.push(`  const ${varName} = new ${name}(page);`);
  });
  testLines.push(``);

  for (const pg of pages) {
    const pageName = sanitizeName(pg.title) + "Page";
    const varName = pageName.charAt(0).toLowerCase() + pageName.slice(1);
    testLines.push(`  // --- ${pg.title} ---`);
    testLines.push(`  await ${varName}.navigate();`);
    for (const step of pg.steps) {
      if (step.type === "navigate") continue;
      const methodName = `${step.type}_${step.target?.text_content
        ? sanitizeName(step.target.text_content).slice(0, 20)
        : "step" + step.sequence}`;
      testLines.push(`  await ${varName}.${methodName}();`);
    }
    testLines.push(``);
  }

  testLines.push(`});`);

  files.push({ path: `tests/${safeName}.spec.${ext}`, content: testLines.join("\n") });
  files.push({
    path: `playwright.config.${ext}`,
    content: `import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
});`,
  });
  files.push({
    path: "package.json",
    content: JSON.stringify({
      name: safeName.toLowerCase(),
      version: "1.0.0",
      scripts: {
        test: "playwright test",
        "test:headed": "playwright test --headed",
        "test:debug": "playwright test --debug",
        "test:report": "playwright show-report",
      },
      devDependencies: {
        "@playwright/test": "^1.40.0",
        "dotenv": "^16.0.0",
        ...(isTs ? { typescript: "^5.0.0" } : {}),
      },
    }, null, 2),
  });
  files.push({ path: ".env.example", content: `SECRET=your_password_here\nBASE_URL=https://your-app.com\n` });
  files.push({ path: ".gitignore", content: `node_modules/\n.env\ntest-results/\nplaywright-report/\n` });
  files.push({
    path: "README.md",
    content: `# ${workflowTitle} — POM Structure\n\nGenerated by TraceDeck\n\n## Run\n\n\`\`\`bash\nnpm install\nnpx playwright install chromium\ncp .env.example .env\nnpm test\n\`\`\`\n`,
  });

  return files;
}

// ─── SELENIUM JAVA POM ────────────────────────────────────────────────────────

function generateSeleniumJavaPOM(opts: ProjectOptions): ProjectFile[] {
  const { workflowTitle, steps } = opts;
  const safeName = sanitizeName(workflowTitle);
  const className = safeName.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  const pages = groupStepsByPage(steps);
  const files: ProjectFile[] = [];

  for (const page of pages) {
    const pageName = sanitizeName(page.title) + "Page";
    const lines: string[] = [];
    lines.push(`package com.tracedeck.pages;`);
    lines.push(`import org.openqa.selenium.*;`);
    lines.push(`import org.openqa.selenium.support.ui.*;`);
    lines.push(`import java.time.Duration;`);
    lines.push(``);
    lines.push(`/** Page Object: ${page.title} — Generated by TraceDeck */`);
    lines.push(`public class ${pageName} {`);
    lines.push(`    private final WebDriver driver;`);
    lines.push(`    private final WebDriverWait wait;`);
    lines.push(``);
    lines.push(`    public ${pageName}(WebDriver driver) {`);
    lines.push(`        this.driver = driver;`);
    lines.push(`        this.wait = new WebDriverWait(driver, Duration.ofSeconds(15));`);
    lines.push(`    }`);
    lines.push(``);
    lines.push(`    public void navigate() {`);
    lines.push(`        driver.get("${page.url}");`);
    lines.push(`        wait.until(d -> ((JavascriptExecutor) d).executeScript("return document.readyState").equals("complete"));`);
    lines.push(`    }`);
    lines.push(``);

    for (const step of page.steps) {
      if (step.type === "navigate") continue;
      const sel = getSelector(step.target, "selenium-java");
      const methodName = `${step.type}${step.target?.text_content
        ? sanitizeName(step.target.text_content).slice(0, 20)
        : "Step" + step.sequence}`;

      lines.push(`    // Step ${step.sequence}: ${step.type}`);
      lines.push(`    public void ${methodName}() {`);
      switch (step.type) {
        case "click":
          lines.push(`        WebElement el = wait.until(ExpectedConditions.elementToBeClickable(${sel}));`);
          lines.push(`        el.click();`);
          lines.push(`        wait.until(d -> ((JavascriptExecutor) d).executeScript("return document.readyState").equals("complete"));`);
          break;
        case "type": {
          const val = step.value === "__SECRET__" ? `System.getenv("SECRET")` : `"${step.value || ""}"`;
          lines.push(`        WebElement el = wait.until(ExpectedConditions.visibilityOfElementLocated(${sel}));`);
          lines.push(`        el.clear();`);
          lines.push(`        el.sendKeys(${val});`);
          break;
        }
        case "select":
          lines.push(`        new Select(wait.until(ExpectedConditions.visibilityOfElementLocated(${sel}))).selectByVisibleText("${step.value}");`);
          break;
        case "scroll":
          lines.push(`        ((JavascriptExecutor) driver).executeScript("window.scrollTo(${step.scrollX || 0}, ${step.scrollY || 0})");`);
          break;
        default:
          lines.push(`        // ${step.type} not supported`);
      }
      lines.push(`    }`);
      lines.push(``);
    }
    lines.push(`}`);
    files.push({ path: `src/test/java/com/tracedeck/pages/${pageName}.java`, content: lines.join("\n") });
  }

  const testLines: string[] = [];
  testLines.push(`package com.tracedeck.tests;`);
  testLines.push(`import com.tracedeck.pages.*;`);
  testLines.push(`import org.junit.jupiter.api.*;`);
  testLines.push(`import org.openqa.selenium.*;`);
  testLines.push(`import org.openqa.selenium.chrome.ChromeDriver;`);
  testLines.push(`import io.github.bonigarcia.wdm.WebDriverManager;`);
  testLines.push(``);
  testLines.push(`/** Workflow: ${workflowTitle} — Generated by TraceDeck */`);
  testLines.push(`public class ${className}Test {`);
  testLines.push(`    private static WebDriver driver;`);
  testLines.push(``);
  testLines.push(`    @BeforeAll static void setup() {`);
  testLines.push(`        WebDriverManager.chromedriver().setup();`);
  testLines.push(`        driver = new ChromeDriver();`);
  testLines.push(`        driver.manage().window().maximize();`);
  testLines.push(`    }`);
  testLines.push(``);
  testLines.push(`    @Test void test${className}() {`);

  for (const page of pages) {
    const pageName = sanitizeName(page.title) + "Page";
    const varName = pageName.charAt(0).toLowerCase() + pageName.slice(1);
    testLines.push(`        ${pageName} ${varName} = new ${pageName}(driver);`);
    testLines.push(`        ${varName}.navigate();`);
    for (const step of page.steps) {
      if (step.type === "navigate") continue;
      const methodName = `${step.type}${step.target?.text_content
        ? sanitizeName(step.target.text_content).slice(0, 20)
        : "Step" + step.sequence}`;
      testLines.push(`        ${varName}.${methodName}();`);
    }
    testLines.push(``);
  }

  testLines.push(`    }`);
  testLines.push(``);
  testLines.push(`    @AfterAll static void teardown() {`);
  testLines.push(`        if (driver != null) driver.quit();`);
  testLines.push(`    }`);
  testLines.push(`}`);

  files.push({ path: `src/test/java/com/tracedeck/tests/${className}Test.java`, content: testLines.join("\n") });
  files.push({
    path: "pom.xml",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.tracedeck</groupId>
    <artifactId>${safeName.toLowerCase()}</artifactId>
    <version>1.0-SNAPSHOT</version>
    <properties>
        <maven.compiler.release>17</maven.compiler.release>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
    <dependencies>
        <dependency><groupId>org.seleniumhq.selenium</groupId><artifactId>selenium-java</artifactId><version>4.18.1</version></dependency>
        <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.10.1</version><scope>test</scope></dependency>
        <dependency><groupId>io.github.bonigarcia</groupId><artifactId>webdrivermanager</artifactId><version>5.7.0</version><scope>test</scope></dependency>
    </dependencies>
    <build><plugins>
        <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-surefire-plugin</artifactId><version>3.2.5</version>
            <configuration><useModulePath>false</useModulePath></configuration></plugin>
    </plugins></build>
</project>`,
  });
  files.push({ path: ".env.example", content: `SECRET=your_password_here\n` });
  files.push({ path: ".gitignore", content: `target/\n.env\n` });
  files.push({ path: "README.md", content: `# ${workflowTitle}\n\nGenerated by TraceDeck\n\n## Run\n\n\`\`\`bash\nmvn clean test\n\`\`\`\n` });

  return files;
}

// ─── SELENIUM PYTHON POM ──────────────────────────────────────────────────────

function generateSeleniumPythonPOM(opts: ProjectOptions): ProjectFile[] {
  const { workflowTitle, steps } = opts;
  const safeName = sanitizeName(workflowTitle).toLowerCase();
  const pages = groupStepsByPage(steps);
  const files: ProjectFile[] = [];

  for (const page of pages) {
    const pageName = sanitizeName(page.title) + "Page";
    const lines: string[] = [];
    lines.push(`from selenium.webdriver.common.by import By`);
    lines.push(`from selenium.webdriver.support.ui import WebDriverWait, Select`);
    lines.push(`from selenium.webdriver.support import expected_conditions as EC`);
    lines.push(``);
    lines.push(`# Page Object: ${page.title} — Generated by TraceDeck`);
    lines.push(`class ${pageName}:`);
    lines.push(`    def __init__(self, driver):`);
    lines.push(`        self.driver = driver`);
    lines.push(`        self.wait = WebDriverWait(driver, 15)`);
    lines.push(``);
    lines.push(`    def navigate(self):`);
    lines.push(`        self.driver.get("${page.url}")`);
    lines.push(`        self.wait.until(lambda d: d.execute_script("return document.readyState") == "complete")`);
    lines.push(``);

    for (const step of page.steps) {
      if (step.type === "navigate") continue;
      const sel = getSelector(step.target, "selenium-py");
      const methodName = `${step.type}_${step.target?.text_content
        ? sanitizeName(step.target.text_content).toLowerCase().slice(0, 20)
        : "step_" + step.sequence}`;

      lines.push(`    # Step ${step.sequence}: ${step.type}`);
      lines.push(`    def ${methodName}(self):`);
      switch (step.type) {
        case "click":
          lines.push(`        el = self.wait.until(EC.element_to_be_clickable((${sel})))`);
          lines.push(`        el.click()`);
          lines.push(`        self.wait.until(lambda d: d.execute_script("return document.readyState") == "complete")`);
          break;
        case "type": {
          const val = step.value === "__SECRET__" ? `os.environ.get("SECRET", "")` : `"${step.value || ""}"`;
          lines.push(`        el = self.wait.until(EC.visibility_of_element_located((${sel})))`);
          lines.push(`        el.clear()`);
          lines.push(`        el.send_keys(${val})`);
          break;
        }
        case "select":
          lines.push(`        Select(self.wait.until(EC.visibility_of_element_located((${sel})))).select_by_visible_text("${step.value}")`);
          break;
        case "scroll":
          lines.push(`        self.driver.execute_script("window.scrollTo(${step.scrollX || 0}, ${step.scrollY || 0})")`);
          break;
        default:
          lines.push(`        pass  # ${step.type} not supported`);
      }
      lines.push(``);
    }

    files.push({ path: `pages/${pageName}.py`, content: lines.join("\n") });
  }

  const testLines: string[] = [];
  testLines.push(`import os`);
  testLines.push(`import pytest`);
  testLines.push(`from selenium import webdriver`);
  for (const page of pages) {
    const pageName = sanitizeName(page.title) + "Page";
    testLines.push(`from pages.${pageName} import ${pageName}`);
  }
  testLines.push(``);
  testLines.push(`# Workflow: ${workflowTitle} — Generated by TraceDeck`);
  testLines.push(``);
  testLines.push(`@pytest.fixture`);
  testLines.push(`def driver():`);
  testLines.push(`    d = webdriver.Chrome()`);
  testLines.push(`    d.maximize_window()`);
  testLines.push(`    yield d`);
  testLines.push(`    d.quit()`);
  testLines.push(``);
  testLines.push(`def test_${safeName}(driver):`);

  for (const page of pages) {
    const pageName = sanitizeName(page.title) + "Page";
    const varName = pageName.toLowerCase();
    testLines.push(`    ${varName} = ${pageName}(driver)`);
    testLines.push(`    ${varName}.navigate()`);
    for (const step of page.steps) {
      if (step.type === "navigate") continue;
      const methodName = `${step.type}_${step.target?.text_content
        ? sanitizeName(step.target.text_content).toLowerCase().slice(0, 20)
        : "step_" + step.sequence}`;
      testLines.push(`    ${varName}.${methodName}()`);
    }
    testLines.push(``);
  }

  files.push({ path: `tests/test_${safeName}.py`, content: testLines.join("\n") });
  files.push({ path: "requirements.txt", content: `selenium==4.18.1\npytest==8.0.0\nwebdriver-manager==4.0.1\npython-dotenv==1.0.0\n` });
  files.push({ path: ".env.example", content: `SECRET=your_password_here\n` });
  files.push({ path: ".gitignore", content: `.env\n__pycache__/\n.pytest_cache/\n` });
  files.push({ path: "README.md", content: `# ${workflowTitle}\n\nGenerated by TraceDeck\n\n## Run\n\n\`\`\`bash\npip install -r requirements.txt\npytest tests/\n\`\`\`\n` });

  return files;
}

// ─── CYPRESS POM ──────────────────────────────────────────────────────────────

function generateCypressPOM(opts: ProjectOptions): ProjectFile[] {
  const { workflowTitle, steps } = opts;
  const safeName = sanitizeName(workflowTitle);
  const pages = groupStepsByPage(steps);
  const files: ProjectFile[] = [];

  for (const page of pages) {
    const pageName = sanitizeName(page.title) + "Page";
    const lines: string[] = [];
    lines.push(`// Page Object: ${page.title} — Generated by TraceDeck`);
    lines.push(`class ${pageName} {`);
    lines.push(`  navigate() {`);
    lines.push(`    cy.visit('${page.url}');`);
    lines.push(`    cy.document().its('readyState').should('eq', 'complete');`);
    lines.push(`  }`);
    lines.push(``);

    for (const step of page.steps) {
      if (step.type === "navigate") continue;
      const sel = getSelector(step.target, "cypress-js");
      const methodName = `${step.type}${step.target?.text_content
        ? sanitizeName(step.target.text_content).slice(0, 20)
        : "Step" + step.sequence}`;

      lines.push(`  // Step ${step.sequence}: ${step.type}`);
      lines.push(`  ${methodName}() {`);
      switch (step.type) {
        case "click":
          lines.push(`    cy.get(${sel}).should('be.visible').click();`);
          if (step.navigated_to) lines.push(`    cy.url().should('include', '${step.navigated_to}');`);
          break;
        case "type": {
          const val = step.value === "__SECRET__" ? `Cypress.env('SECRET')` : `'${step.value || ""}'`;
          lines.push(`    cy.get(${sel}).should('be.visible').clear().type(${val});`);
          break;
        }
        case "select":
          lines.push(`    cy.get(${sel}).select('${step.value}');`);
          break;
        case "keypress":
          lines.push(`    cy.focused().type('{${(step.key || "").toLowerCase()}}');`);
          break;
        case "scroll":
          lines.push(`    cy.scrollTo(${step.scrollX || 0}, ${step.scrollY || 0});`);
          break;
        default:
          lines.push(`    // ${step.type} not supported`);
      }
      lines.push(`  }`);
      lines.push(``);
    }

    lines.push(`}`);
    lines.push(`export default ${pageName};`);
    files.push({ path: `cypress/pages/${pageName}.js`, content: lines.join("\n") });
  }

  const testLines: string[] = [];
  for (const page of pages) {
    testLines.push(`import ${sanitizeName(page.title)}Page from '../pages/${sanitizeName(page.title)}Page';`);
  }
  testLines.push(``);
  testLines.push(`// Workflow: ${workflowTitle} — Generated by TraceDeck`);
  testLines.push(`describe('${workflowTitle}', () => {`);
  testLines.push(`  it('should complete the recorded workflow', () => {`);

  for (const page of pages) {
    const pageName = sanitizeName(page.title) + "Page";
    const varName = pageName.charAt(0).toLowerCase() + pageName.slice(1);
    testLines.push(`    const ${varName} = new ${pageName}();`);
    testLines.push(`    ${varName}.navigate();`);
    for (const step of page.steps) {
      if (step.type === "navigate") continue;
      const methodName = `${step.type}${step.target?.text_content
        ? sanitizeName(step.target.text_content).slice(0, 20)
        : "Step" + step.sequence}`;
      testLines.push(`    ${varName}.${methodName}();`);
    }
    testLines.push(``);
  }

  testLines.push(`  });`);
  testLines.push(`});`);

  files.push({ path: `cypress/e2e/${safeName}.cy.js`, content: testLines.join("\n") });
  files.push({
    path: "cypress.config.js",
    content: `const { defineConfig } = require('cypress');
module.exports = defineConfig({
  e2e: {
    specPattern: 'cypress/e2e/**/*.cy.js',
    defaultCommandTimeout: 15000,
    pageLoadTimeout: 30000,
    screenshotOnRunFailure: true,
    video: true,
  },
  env: { SECRET: '' },
});`,
  });
  files.push({
    path: "package.json",
    content: JSON.stringify({
      name: safeName.toLowerCase(),
      version: "1.0.0",
      scripts: { test: "cypress run", "test:open": "cypress open" },
      devDependencies: { cypress: "^13.0.0" },
    }, null, 2),
  });
  files.push({ path: ".env.example", content: `SECRET=your_password_here\n` });
  files.push({ path: ".gitignore", content: `node_modules/\ncypress/videos/\ncypress/screenshots/\n` });
  files.push({ path: "README.md", content: `# ${workflowTitle}\n\nGenerated by TraceDeck\n\n## Run\n\n\`\`\`bash\nnpm install\nnpm test\n\`\`\`\n` });

  return files;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateProject(opts: ProjectOptions): ProjectFile[] {
  const { framework, structure } = opts;

  if (structure === "simple") {
    if (framework === "playwright-js" || framework === "playwright-ts") {
      return generatePlaywrightSimple(opts);
    }
  }

  switch (framework) {
    case "playwright-js":
    case "playwright-ts":
      return generatePlaywrightPOM(opts);
    case "playwright-py":
      return generateSeleniumPythonPOM({ ...opts, framework: "playwright-py" });
    case "selenium-java":
      return generateSeleniumJavaPOM(opts);
    case "selenium-py":
      return generateSeleniumPythonPOM(opts);
    case "cypress-js":
      return generateCypressPOM(opts);
    default:
      return generatePlaywrightSimple(opts);
  }
}
