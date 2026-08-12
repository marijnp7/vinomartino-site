import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// WCAG contrast ratio calculation
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(x => {
    x = x / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(fg, bg) {
  const l1 = getLuminance(fg.r, fg.g, fg.b);
  const l2 = getLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToObject(rgbString) {
  const match = rgbString.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!match) return null;
  return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
}

function isFontSizeLarge(fontSize) {
  const px = parseInt(fontSize);
  return px >= 24 || (px >= 18.66 && fontSize.includes('bold'));
}

function getThresholdForElement(element) {
  const fontWeight = element.fontWeight;
  const fontSize = element.fontSize;
  const isBold = fontWeight >= 700;
  const pxSize = parseInt(fontSize);

  if (pxSize >= 24 || (pxSize >= 18.66 && isBold)) {
    return { threshold: 3, category: 'large' };
  }
  return { threshold: 4.5, category: 'normal' };
}

async function measureContrast(page) {
  const results = [];
  const errors = [];

  // Find all text elements in #atlas
  const elements = await page.locator('#atlas *').all();

  for (const element of elements) {
    try {
      const text = await element.textContent();
      const isVisible = await element.isVisible();

      if (!text || !text.trim() || !isVisible) continue;

      // Get computed styles
      const styles = await element.evaluate(el => {
        const computed = window.getComputedStyle(el);
        const bgColor = computed.backgroundColor;
        const color = computed.color;
        const fontSize = computed.fontSize;
        const fontWeight = computed.fontWeight;

        return {
          text: el.textContent.substring(0, 50),
          color,
          backgroundColor: bgColor,
          fontSize,
          fontWeight,
          tagName: el.tagName,
          className: el.className
        };
      });

      // Parse colors
      const fgColor = rgbToObject(styles.color);
      const bgColor = rgbToObject(styles.backgroundColor);

      if (!fgColor || !bgColor) continue;

      // Calculate contrast
      const ratio = getContrastRatio(fgColor, bgColor);
      const { threshold, category } = getThresholdForElement({
        fontSize: styles.fontSize,
        fontWeight: parseInt(styles.fontWeight)
      });

      const passes = ratio >= threshold;

      results.push({
        element: `${styles.tagName}.${styles.className}`,
        text: styles.text,
        foreground: styles.color,
        background: styles.backgroundColor,
        ratio: parseFloat(ratio.toFixed(2)),
        threshold,
        category,
        passes,
        fontsize: styles.fontSize
      });
    } catch (e) {
      // Skip elements we can't measure
    }
  }

  return results;
}

async function canaryTest() {
  // Test known color pairs
  const tests = [
    { fg: { r: 118, g: 118, b: 118 }, bg: { r: 255, g: 255, b: 255 }, expected: 4.54, tolerance: 0.1 },
    { fg: { r: 136, g: 136, b: 136 }, bg: { r: 255, g: 255, b: 255 }, expected: 3.54, tolerance: 0.1 }
  ];

  const canaryResults = [];
  for (const test of tests) {
    const ratio = getContrastRatio(test.fg, test.bg);
    const pass = Math.abs(ratio - test.expected) < test.tolerance;
    canaryResults.push({
      fg: `rgb(${test.fg.r}, ${test.fg.g}, ${test.fg.b})`,
      bg: `rgb(${test.bg.r}, ${test.bg.g}, ${test.bg.b})`,
      ratio: parseFloat(ratio.toFixed(2)),
      expected: test.expected,
      pass
    });
  }

  return canaryResults;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.createContext();
  const page = await context.newPage();

  // Set viewport to standard mobile size
  await page.setViewportSize({ width: 1280, height: 720 });

  try {
    // Navigate to production homepage
    console.log('Navigating to vinomartino.com...');
    await page.goto('https://vinomartino.com/', { waitUntil: 'networkidle' });

    // Verify we're on the page
    const atlasExists = await page.locator('#atlas').count() > 0;
    if (!atlasExists) {
      throw new Error('Atlas section not found on homepage');
    }

    // Enable dark mode by toggling cellar theme
    console.log('Enabling dark mode (cellar theme)...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'cellar');
      localStorage.setItem('theme', 'cellar');
    });

    // Wait for theme to apply
    await page.waitForTimeout(500);

    // Run canary test first
    console.log('Running canary test...');
    const canary = await canaryTest();
    const canaryPass = canary.every(t => t.pass);

    if (!canaryPass) {
      console.error('CANARY TEST FAILED:');
      console.table(canary);
      process.exit(1);
    }
    console.log('✓ Canary test passed');

    // Measure contrast
    console.log('Measuring contrast in atlas section and map components...');
    const results = await measureContrast(page);

    // Create output directory
    mkdirSync('artifacts', { recursive: true });

    // Save results to JSON
    const report = {
      timestamp: new Date().toISOString(),
      url: 'https://vinomartino.com/',
      theme: 'cellar (dark mode)',
      canary: canary,
      measurements: results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.passes).length,
        failed: results.filter(r => !r.passes).length
      }
    };

    writeFileSync('artifacts/contrast-report.json', JSON.stringify(report, null, 2));

    // Create markdown report
    let markdown = `# WCAG AA Contrast Measurement Report\n\n`;
    markdown += `**Generated:** ${new Date().toISOString()}\n`;
    markdown += `**URL:** ${report.url}\n`;
    markdown += `**Theme:** ${report.theme}\n\n`;

    markdown += `## Canary Test\n\n`;
    markdown += `| FG | BG | Ratio | Expected | Pass |\n`;
    markdown += `|----|----|-------|----------|------|\n`;
    for (const t of canary) {
      markdown += `| ${t.fg} | ${t.bg} | ${t.ratio} | ${t.expected} | ${t.pass ? '✓' : '✗'} |\n`;
    }

    markdown += `\n## Contrast Measurements\n\n`;
    markdown += `**Summary:** ${report.summary.passed}/${report.summary.total} elements pass WCAG AA\n\n`;

    const failed = results.filter(r => !r.passes);
    if (failed.length > 0) {
      markdown += `### ⚠️ Failed Elements (${failed.length})\n\n`;
      markdown += `| Element | Text | FG | BG | Ratio | Threshold | Category |\n`;
      markdown += `|---------|------|----|----|-------|-----------|----------|\n`;
      for (const r of failed) {
        markdown += `| ${r.element} | ${r.text} | ${r.foreground} | ${r.background} | **${r.ratio}** | ${r.threshold} | ${r.category} |\n`;
      }
    }

    markdown += `\n### ✓ Passed Elements\n\n`;
    const passed = results.filter(r => r.passes);
    if (passed.length > 0) {
      markdown += `| Element | Text | Ratio | Threshold | Category |\n`;
      markdown += `|---------|------|-------|-----------|----------|\n`;
      for (const r of passed) {
        markdown += `| ${r.element} | ${r.text} | ${r.ratio} | ${r.threshold} | ${r.category} |\n`;
      }
    } else {
      markdown += `(No elements passed)\n`;
    }

    writeFileSync('artifacts/contrast-report.md', markdown);

    // Log summary
    console.log('\n' + markdown);

    // Set job summary for GitHub Actions
    if (process.env.GITHUB_STEP_SUMMARY) {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    }

    // Exit with failure if any elements failed
    if (failed.length > 0) {
      console.error(`\n❌ ${failed.length} elements failed WCAG AA contrast requirements`);
      process.exit(1);
    } else {
      console.log('\n✓ All elements pass WCAG AA contrast requirements');
      process.exit(0);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await context.close();
    await browser.close();
  }
}

main();
