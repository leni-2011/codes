(() => {
  const $ = (id) => document.getElementById(id);

  const hub = $('hub');
  const runner = $('runner');
  const frame = $('runnerFrame');
  const playground = $('playground');
  const editor = $('codeTextarea');
  const gutter = $('lineNumbers');
  const highlight = $('codeHl');
  const stdin = $('stdinInput');
  const runBtn = $('runBtn');
  const status = $('runStatus');
  const output = $('outputText');
  const outputFrame = $('outputFrame');
  const codeInput = $('codeInput');
  const resultUrl = $('resultUrl');
  const modal = $('openModal');

  const homeTitle = document.title;
  let code = null;
  let blobUrl = null;
  let hlLang = null;
  let running = false;

  const langs = {
    py: ['Python', 'main.py', 'python'],
    cpp: ['C++', 'main.cpp', 'cpp'],
    c: ['C', 'main.c', 'c'],
    cs: ['C#', 'Program.cs', 'csharp'],
    java: ['Java', 'Program.java', 'java'],
    kt: ['Kotlin', 'Main.kt', 'kotlin'],
    swift: ['Swift', 'main.swift', 'swift'],
    rb: ['Ruby', 'main.rb', 'ruby'],
    php: ['PHP', 'index.php', 'php'],
    go: ['Go', 'main.go', 'go'],
    node: ['JavaScript', 'index.js', 'javascript'],
    web: ['Web', 'index.html']
  };

  const aliases = {
    python: 'py', 'c++': 'cpp', csharp: 'cs', 'c#': 'cs', kotlin: 'kt',
    ruby: 'rb', golang: 'go', js: 'node', javascript: 'node', html: 'web'
  };

  function langInfo(raw) {
    let key = (raw || '').toLowerCase().trim();
    key = aliases[key] || key;
    const [name, file, hl] = langs[key] || [key.toUpperCase() || 'Code', 'main.txt'];
    return { name, file, hl, isWeb: key === 'web' };
  }

  function extractId(input) {
    const s = input.trim();
    const m = s.match(/compiler-playground\/(?:id\/)?([\w-]+)/i)
      || s.match(/#([\w-]{4,})/)
      || s.match(/^([\w-]{4,})(?:[?&#]|$)/);
    return m ? m[1] : null;
  }

  const BASE_URL = 'https://leni-2011.github.io/codes';

  function shareUrl(id) {
    return `${BASE_URL}#${id}`;
  }

  function parsePage(html) {
    const m = html.match(/window\.initialData\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
    if (!m) return null;
    try {
      return JSON.parse(m[1]).ssrUserCode?.data;
    } catch {
      return null;
    }
  }

  async function fetchCode(id) {
    const api = `https://api2.sololearn.com/v2/codeplayground/usercodes/${id}`;
    const page = `https://www.sololearn.com/compiler-playground/${id}`;
    const proxy = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

    const sources = [
      [api, async (res) => (await res.json()).data],
      [proxy(api), async (res) => (await res.json()).data],
      [page, async (res) => parsePage(await res.text())],
      [proxy(page), async (res) => parsePage(await res.text())]
    ];

    for (const [url, read] of sources) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await read(res);
        if (data) return data;
      } catch {}
    }
    throw new Error('Could not load this code. Make sure the ID is valid and the code is public.');
  }

  function buildPage({ sourceCode, cssCode, jsCode, name }) {
    const style = cssCode ? `<style>\n${cssCode}\n</style>` : '';
    const script = jsCode ? `<script>\n${jsCode}\n</script>` : '';
    let doc = (sourceCode || '').trim();
    const hasHead = /<head[^>]*>/i.test(doc);
    const hasBody = /<body[^>]*>/i.test(doc);

    if (!hasHead && !hasBody) {
      const title = (name || '').replace(/</g, '&lt;');
      return `<!DOCTYPE html><html><head><meta charset="UTF-8">`
        + `<meta name="viewport" content="width=device-width,initial-scale=1">`
        + `<title>${title}</title>${style}</head><body>${doc}${script}</body></html>`;
    }

    doc = hasHead ? doc.replace(/<\/head>/i, `${style}\n</head>`) : style + doc;
    doc = hasBody ? doc.replace(/<\/body>/i, `${script}\n</body>`) : doc + script;
    return doc;
  }

  function showWeb(data) {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([buildPage(data)], { type: 'text/html' }));
    frame.src = blobUrl;
    frame.classList.remove('hidden');
  }

  function splitHtml(text) {
    const start = text.search(/<!doctype html|<html[\s>]/i);
    if (start !== -1) return [text.slice(0, start), text.slice(start)];
    if (/^<[a-z!][\s\S]*>$/i.test(text.trim())) return ['', text.trim()];
    return [text, ''];
  }

  function print(text, cls) {
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = text;
    output.appendChild(span);
  }

  function clearOutput(message) {
    $('outputBody').classList.remove('has-frame');
    outputFrame.classList.add('hidden');
    outputFrame.removeAttribute('srcdoc');
    output.classList.remove('hidden');
    output.textContent = '';
    if (message) print(message, 'muted');
  }

  function showOutput(stdout, stderr) {
    clearOutput();
    const [text, html] = splitHtml(stdout || '');
    const out = text.trimEnd();
    const err = (stderr || '').trimEnd();

    if (out) print(out + '\n');
    if (err) print(err + '\n', 'stderr');

    if (html) {
      const css = '<style>html,body{margin:0;padding:8px}img,video,canvas,svg{max-width:100%;height:auto}</style>';
      $('outputBody').classList.add('has-frame');
      outputFrame.classList.remove('hidden');
      outputFrame.srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + css) : css + html;
      if (!out && !err) output.classList.add('hidden');
    } else if (!out && !err) {
      print('No output.', 'muted');
    }
  }

  function setStatus(text, state) {
    status.textContent = text;
    status.className = state ? `status is-${state}` : 'status';
  }

  async function compile() {
    const res = await fetch('https://api2.sololearn.com/v2/codeplayground/v2/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codeId: code.id || 0,
        language: code.language || 'py',
        code: editor.value,
        input: stdin.value
      })
    });
    if (!res.ok) throw new Error(`Compiler returned HTTP ${res.status}`);

    const json = await res.json();
    if (!json.success && json.errors?.length) throw new Error(json.errors.join('; '));
    return json.data || {};
  }

  async function run() {
    if (running || !code) return;
    running = true;
    runBtn.disabled = true;
    $('runLabel').textContent = 'Running';
    setStatus('Running');
    clearOutput('Running...');
    showTab('output');

    const start = performance.now();
    try {
      const { output: stdout, error } = await compile();
      showOutput(stdout, error);
      const secs = ((performance.now() - start) / 1000).toFixed(2);
      setStatus(`${secs}s`, error?.trim() ? 'error' : 'done');
    } catch (err) {
      clearOutput();
      print(err.message, 'stderr');
      setStatus('Error', 'error');
    }
    running = false;
    runBtn.disabled = false;
    $('runLabel').textContent = 'Run';
  }

  function syncScroll() {
    gutter.scrollTop = editor.scrollTop;
    highlight.parentElement.scrollTop = editor.scrollTop;
    highlight.parentElement.scrollLeft = editor.scrollLeft;
  }

  function refreshEditor() {
    const text = editor.value;
    gutter.innerHTML = text.split('\n').map((_, i) => `<div>${i + 1}</div>`).join('');

    const canHighlight = !!(window.hljs && hlLang && hljs.getLanguage(hlLang));
    $('codeArea').classList.toggle('has-hl', canHighlight);
    if (canHighlight) {
      highlight.innerHTML = hljs.highlight(text.endsWith('\n') ? text + ' ' : text, { language: hlLang }).value;
    }
    syncScroll();
  }

  function showTab(name) {
    $('workspace').dataset.view = name;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  }

  function setInputOpen(open) {
    $('inputPanel').classList.toggle('hidden', !open);
    $('inputToggle').classList.toggle('active', open);
    $('inputToggle').setAttribute('aria-expanded', open);
    if (open) stdin.focus();
  }

  function showPlayground(data) {
    const lang = langInfo(data.language);
    $('pgTitle').textContent = data.name || 'Untitled';
    $('pgMeta').textContent = `${data.userName || 'Anonymous'} · ${lang.name}`;
    $('fileName').textContent = lang.file;

    hlLang = lang.hl;
    editor.value = data.sourceCode || '';
    refreshEditor();

    stdin.value = '';
    setInputOpen(false);
    setStatus('');
    clearOutput('Press Run to see the output.');
    showTab('code');
    playground.classList.remove('hidden');
  }

  async function openRunner(id) {
    hub.classList.add('hidden');
    runner.classList.remove('hidden');
    frame.classList.add('hidden');
    playground.classList.add('hidden');
    $('runnerError').classList.add('hidden');
    $('runnerLoader').classList.remove('hidden');

    try {
      code = await fetchCode(id);
      document.title = code.name || 'Code';
      if (langInfo(code.language).isWeb) showWeb(code);
      else showPlayground(code);
    } catch (err) {
      $('runnerErrorMsg').textContent = err.message;
      $('runnerError').classList.remove('hidden');
    }
    $('runnerLoader').classList.add('hidden');
  }

  function closeRunner() {
    runner.classList.add('hidden');
    hub.classList.remove('hidden');
    frame.src = 'about:blank';
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    code = null;
    document.title = homeTitle;
  }

  function showResult(state) {
    $('result').classList.remove('hidden');
    $('errorMsg').classList.toggle('hidden', state !== 'error');
    $('successBlock').classList.toggle('hidden', state !== 'success');
    $('loader').classList.toggle('hidden', state !== 'loading');
  }

  function showError(message) {
    $('errorMsg').textContent = message;
    showResult('error');
  }

  async function generate() {
    const id = extractId(codeInput.value);
    if (!id) return showError('Please enter a valid SoloLearn code link or code ID.');

    showResult('loading');
    $('goBtn').disabled = true;
    try {
      const data = await fetchCode(id);
      resultUrl.value = shareUrl(id);
      $('codeName').textContent = data.name ? `${data.name} by ${data.userName || 'anonymous'}` : 'Untitled';
      $('codeLangBadge').textContent = langInfo(data.language).name;
      showResult('success');
    } catch (err) {
      showError(err.message);
    }
    $('goBtn').disabled = false;
  }

  function updateClearBtn() {
    $('clearBtn').classList.toggle('hidden', !codeInput.value);
  }

  function closeModal() {
    modal.classList.add('hidden');
    $('openBtn').focus();
  }

  editor.addEventListener('input', refreshEditor);
  editor.addEventListener('scroll', syncScroll);
  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    editor.setRangeText('    ', editor.selectionStart, editor.selectionEnd, 'end');
    refreshEditor();
  });

  runBtn.addEventListener('click', run);
  $('inputToggle').addEventListener('click', () => setInputOpen($('inputPanel').classList.contains('hidden')));
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  $('clearBtn').addEventListener('click', () => {
    codeInput.value = '';
    updateClearBtn();
    codeInput.focus();
  });
  codeInput.addEventListener('input', updateClearBtn);
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && generate());
  $('goBtn').addEventListener('click', generate);

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      codeInput.value = chip.dataset.id;
      updateClearBtn();
      generate();
    });
  });

  $('copyBtn').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(resultUrl.value);
      e.target.textContent = 'Copied';
      setTimeout(() => (e.target.textContent = 'Copy Link'), 1500);
    } catch {
      resultUrl.select();
    }
  });

  $('openBtn').addEventListener('click', () => {
    modal.classList.remove('hidden');
    $('modalConfirm').focus();
  });
  $('modalConfirm').addEventListener('click', () => {
    closeModal();
    window.open(resultUrl.value, '_blank', 'noopener');
  });
  $('modalCancel').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => e.target === modal && closeModal());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !playground.classList.contains('hidden')) {
      e.preventDefault();
      run();
    }
  });

  function route() {
    const id = extractId(location.hash.slice(1));
    if (id) openRunner(id);
    else closeRunner();
  }

  updateClearBtn();
  window.addEventListener('hashchange', route);
  if (location.hash.length > 1) route();
})();
