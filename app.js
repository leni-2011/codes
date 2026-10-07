(() => {
  'use strict';

  const hub = document.getElementById('hub');
  const runner = document.getElementById('runner');
  const codeInput = document.getElementById('codeInput');
  const clearBtn = document.getElementById('clearBtn');
  const goBtn = document.getElementById('goBtn');
  const result = document.getElementById('result');
  const errorMsg = document.getElementById('errorMsg');
  const successBlock = document.getElementById('successBlock');
  const loader = document.getElementById('loader');
  const resultUrl = document.getElementById('resultUrl');
  const codeName = document.getElementById('codeName');
  const copyBtn = document.getElementById('copyBtn');
  const openBtn = document.getElementById('openBtn');
  const runnerFrame = document.getElementById('runnerFrame');
  const runnerLoader = document.getElementById('runnerLoader');
  const runnerError = document.getElementById('runnerError');
  const runnerErrorMsg = document.getElementById('runnerErrorMsg');
  const runnerBackBtn = document.getElementById('runnerBackBtn');

  let activeBlobUrl = null;

  function extractId(raw) {
    if (!raw) return null;
    const s = raw.trim();
    const match = s.match(/compiler-playground\/(?:id\/)?([a-zA-Z0-9_-]+)/i);
    if (match) return match[1];
    const hashMatch = s.match(/#([a-zA-Z0-9_-]{4,})/);
    if (hashMatch) return hashMatch[1];
    const clean = s.replace(/^#/, '').split(/[?&#]/)[0];
    if (/^[a-zA-Z0-9_-]{4,}$/.test(clean)) return clean;
    return null;
  }

  function baseUrl() {
    return "https://leni-2011.github.io/codes";
  }

  function extractInitialData(html) {
    const marker = 'window.initialData';
    const idx = html.indexOf(marker);
    if (idx === -1) return null;

    const eqIdx = html.indexOf('=', idx);
    if (eqIdx === -1) return null;

    const startObj = html.indexOf('{', eqIdx);
    if (startObj === -1) return null;

    const scriptEnd = html.indexOf('<' + '/script>', startObj);
    const candidate = scriptEnd !== -1 ? html.slice(startObj, scriptEnd) : html.slice(startObj);
    let trimmed = candidate.trim();
    if (trimmed.endsWith(';')) trimmed = trimmed.slice(0, -1).trim();

    try {
      return JSON.parse(trimmed);
    } catch (e) { }

    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startObj; i < html.length; i++) {
      const ch = html[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(html.slice(startObj, i + 1));
            } catch (e) { }
            break;
          }
        }
      }
    }

    return null;
  }

  async function fetchCode(id) {
    const url = `https://www.sololearn.com/compiler-playground/${id}`;
    const endpoints = [
      url,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) continue;
        const html = await res.text();
        const data = extractInitialData(html);
        const code = data?.ssrUserCode?.data;
        if (!code) continue;

        if (code.language && code.language.toLowerCase() !== 'web') {
          throw new Error(`This code is written in ${code.language}. SoloRunner only supports Web codes.`);
        }

        return code;
      } catch (err) {
        if (err.message && err.message.includes('SoloRunner only supports')) throw err;
      }
    }

    throw new Error('Could not fetch this code. Make sure the link or ID is correct and the code is public.');
  }

  function stitch(code) {
    const { sourceCode = '', cssCode = '', jsCode = '', name = '' } = code;
    const style = cssCode ? `<style>${cssCode}</style>` : '';
    const script = jsCode ? '<script>' + jsCode + '<' + '/script>' : '';
    let doc = sourceCode.trim();

    const hasHead = /<head[^>]*>/i.test(doc);
    const hasBody = /<body[^>]*>/i.test(doc);

    if (hasHead) doc = doc.replace(/<\/head>/i, `${style}\n</head>`);
    if (hasBody) doc = doc.replace(/<\/body>/i, `${script}\n</body>`);

    if (!hasHead && !hasBody) {
      const esc = (name || 'SoloLearn Output').replace(/</g, '&lt;');
      doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc}</title>${style}</head><body>${doc}${script}</body></html>`;
    } else {
      if (!hasHead && style) doc = style + '\n' + doc;
      if (!hasBody && script) doc = doc + '\n' + script;
    }

    return doc;
  }

  function renderToFrame(iframe, code) {
    if (activeBlobUrl) {
      URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = null;
    }
    const blob = new Blob([stitch(code)], { type: 'text/html;charset=utf-8' });
    activeBlobUrl = URL.createObjectURL(blob);
    iframe.src = activeBlobUrl;
  }

  function showState(state) {
    result.classList.remove('hidden');
    errorMsg.classList.add('hidden');
    successBlock.classList.add('hidden');
    loader.classList.add('hidden');

    if (state === 'loading') loader.classList.remove('hidden');
    if (state === 'error') errorMsg.classList.remove('hidden');
    if (state === 'success') successBlock.classList.remove('hidden');
  }

  async function generate() {
    const id = extractId(codeInput.value);
    if (!id) {
      showState('error');
      errorMsg.textContent = 'Please enter a valid SoloLearn code link or ID.';
      return;
    }

    showState('loading');
    goBtn.disabled = true;
    try {
      const code = await fetchCode(id);
      resultUrl.value = `${baseUrl()}#${id}`;
      codeName.textContent = code.name ? `${code.name} by ${code.userName || 'anonymous'}` : '';
      showState('success');
    } catch (err) {
      showState('error');
      errorMsg.textContent = err.message;
    } finally {
      goBtn.disabled = false;
    }
  }

  function updateClearBtn() {
    if (!clearBtn) return;
    if (codeInput.value.length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      codeInput.value = '';
      updateClearBtn();
      codeInput.focus();
    });
  }

  codeInput.addEventListener('input', updateClearBtn);
  updateClearBtn();

  goBtn.addEventListener('click', generate);
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generate();
  });

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      box.remove();
      return ok;
    }
  }

  copyBtn.addEventListener('click', async () => {
    if (!resultUrl.value) return;
    const ok = await copyText(resultUrl.value);
    if (ok) {
      const prev = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = prev;
      }, 1500);
    }
  });

  openBtn.addEventListener('click', () => {
    if (resultUrl.value) {
      window.open(resultUrl.value, '_blank');
    }
  });

  function openRunner(id) {
    hub.classList.add('hidden');
    runner.classList.remove('hidden');
    runnerLoader.classList.remove('hidden');
    runnerError.classList.add('hidden');

    fetchCode(id)
      .then((code) => {
        document.title = code.name || 'SoloRunner';
        renderToFrame(runnerFrame, code);
        runnerLoader.classList.add('hidden');
      })
      .catch((err) => {
        runnerLoader.classList.add('hidden');
        runnerError.classList.remove('hidden');
        runnerErrorMsg.textContent = err.message;
      });
  }

  function closeRunner() {
    runner.classList.add('hidden');
    hub.classList.remove('hidden');
    runnerFrame.src = 'about:blank';
    if (activeBlobUrl) {
      URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = null;
    }
    document.title = 'SoloRunner';
    history.pushState('', '', window.location.pathname);
  }

  runnerBackBtn.addEventListener('click', closeRunner);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !runner.classList.contains('hidden')) {
      closeRunner();
    }
  });

  function route() {
    const hash = location.hash.replace(/^#/, '').split('?')[0].trim();
    const id = extractId(hash);
    if (id) {
      openRunner(id);
    } else {
      closeRunner();
    }
  }

  window.addEventListener('hashchange', route);
  if (location.hash.replace(/^#/, '').trim()) {
    route();
  }
})();
