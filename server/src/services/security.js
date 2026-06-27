function validateGeneratedCode(htmlContent) {
  const dangerous = [
    { pattern: /<script[^>]*src\s*=\s*['"]https?:\/\/[^'"]+['"]/gi, name: 'External script' },
    { pattern: /<iframe[^>]*src\s*=\s*['"]https?:\/\//gi, name: 'External iframe' },
    { pattern: /document\.cookie/gi, name: 'Cookie access' },
    { pattern: /javascript\s*:\s*(?!\/\*)/gi, name: 'javascript: protocol' },
  ];

  const findings = [];
  for (const { pattern, name } of dangerous) {
    pattern.lastIndex = 0;
    if (pattern.test(htmlContent)) findings.push({ pattern: name });
  }

  return { safe: findings.length === 0, findings };
}

function sanitizeHtmlCode(htmlContent) {
  return htmlContent
    .replace(/<script[^>]*src\s*=\s*['"]https?:\/\/[^'"]+['"][^>]*>[\s\S]*?<\/script>/gi, '<!-- external script removed -->')
    .replace(/document\.cookie/gi, '/* blocked */""')
    .replace(/javascript\s*:/gi, 'data-invalid:');
}

module.exports = { validateGeneratedCode, sanitizeHtmlCode };
