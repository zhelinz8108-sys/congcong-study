import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdir, access, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const {chromium} = createRequire(import.meta.url)('playwright');

// This test never forwards an API request. All materials and writes are synthetic.
const origin = process.env.DATED_LISTENING_QA_ORIGIN ?? 'http://127.0.0.1:3139';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Only local QA is allowed');
const subjectId = '8bd6f79b-99f5-4e68-a961-872d60d260b1';
const unitId = '00000000-0000-4000-8000-000000000009';
const home = `/subjects/${subjectId}`;
const dated = `${home}/listening/2026-11-09`;
const api = `/api/subjects/${subjectId}/listening/2026-11-09`;
const output = path.resolve('tmp/dated-listening-browser');
await mkdir(output, {recursive: true});

const wav = Buffer.alloc(44 + 16000);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=', 'base64');
const pdf = Buffer.from('%PDF-1.4\n% synthetic browser fixture only\n%%EOF\n');
const fixtures = {
  'november-9-listening.wav': {mime: 'audio/wav', body: wav},
  'november-9-questions.png': {mime: 'image/png', body: png},
  'november-9-worksheet.pdf': {mime: 'application/pdf', body: pdf},
  'fallback-without-mime.mp3': {mime: 'audio/mpeg', body: Buffer.from('ID3 synthetic fixture')},
  'saved-before-error.png': {mime: 'image/png', body: png},
  'upload-fails.pdf': {mime: 'application/pdf', body: pdf},
};
const state = {materials: [], uploadLog: [], materialLog: [], createCalls: 0, getCalls: 0,
  failReads: 0, unexpectedApis: [], uploadFailures: new Set()};
const pageErrors = [];
const checks = [];

let browser;
const launchErrors = [];
for (const executablePath of [undefined, '/usr/bin/chromium', '/opt/google/chrome/chrome']) {
  if (executablePath) {
    try { await access(executablePath); } catch { continue; }
  }
  try {
    browser = await chromium.launch({headless: true, executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage']});
    break;
  } catch (error) { launchErrors.push(error.message.split('\n')[0]); }
}
assert.ok(browser, `Chromium could not start: ${launchErrors.join('; ')}`);
const context = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'});
const payload = `v1.${Date.now() + 30 * 60 * 1000}`;
const token = `${payload}.${createHmac('sha256', 'dated-listening-local-only').update(payload).digest('base64url')}`;
await context.addCookies([{name: 'congcong_family_access', value: token, url: origin}]);
await context.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  if (url.origin !== origin) {
    state.unexpectedApis.push(`${method} ${url.pathname}`);
    await route.abort(); return;
  }
  const json = (body, status = 200) => route.fulfill({status, contentType: 'application/json',
    headers: {'Cache-Control': 'no-store'}, body: JSON.stringify(body)});
  if (url.pathname === `/api/subjects/${subjectId}` && url.search === '?meta=1' && method === 'GET') {
    await json({id: subjectId, name: '英语', icon: '📘', color: '#17b963', sort_order: 1}); return;
  }
  if (url.pathname === '/api/access/profile' && method === 'GET') {
    await json({profile: {id: 'congcong', name: '聪聪'}}); return;
  }
  if (url.pathname === api && method === 'GET') {
    state.getCalls++;
    if (state.failReads > 0) { state.failReads--; await json({error: '模拟资料读取失败，请重试。'}, 503); return; }
    await json({unitId, materials: state.materials}); return;
  }
  if (url.pathname === api && method === 'POST') {
    assert.deepEqual(request.postDataJSON(), {});
    state.createCalls++;
    await json({unitId}, state.createCalls === 1 ? 201 : 200); return;
  }
  if (url.pathname === '/api/upload' && method === 'POST') {
    const multipart = request.postDataBuffer().toString('latin1');
    const name = multipart.match(/filename="([^"]+)"/)?.[1];
    const mime = multipart.match(/Content-Type:\s*([^\r\n]+)/i)?.[1];
    assert.ok(fixtures[name], `Unknown synthetic upload ${name}`);
    assert.equal(mime, fixtures[name].mime, `${name}: correct MIME on upload`);
    state.uploadLog.push({name, mime});
    if (state.uploadFailures.has(name)) { await json({error: '模拟音频存储失败'}, 500); return; }
    await json({file_path: `/api/files/synthetic/${name}`,
      file_type: mime.startsWith('audio/') ? 'audio' : mime.startsWith('image/') ? 'image' : 'pdf',
      original_name: name}); return;
  }
  if (url.pathname === '/api/materials' && method === 'POST') {
    const body = request.postDataJSON();
    assert.equal(body.unit_id, unitId, 'Material must use the unit returned by the date API');
    assert.ok(fixtures[body.name]);
    assert.equal(body.file_path, `/api/files/synthetic/${body.name}`);
    assert.equal(body.file_size, fixtures[body.name].body.length);
    const expectedType = fixtures[body.name].mime.startsWith('audio/') ? 'audio'
      : fixtures[body.name].mime.startsWith('image/') ? 'image' : 'pdf';
    assert.equal(body.file_type, expectedType);
    const material = {...body, id: `synthetic-material-${state.materials.length + 1}`,
      sort_order: state.materials.length + 1, created_at: '2026-11-09T00:00:00Z'};
    state.materialLog.push(body); state.materials.push(material);
    await json(material, 201); return;
  }
  if (url.pathname.startsWith('/api/files/synthetic/') && method === 'GET') {
    const name = decodeURIComponent(url.pathname.split('/').at(-1));
    assert.ok(fixtures[name], `Unknown synthetic media ${name}`);
    await route.fulfill({status: 200, contentType: fixtures[name].mime, body: fixtures[name].body}); return;
  }
  state.unexpectedApis.push(`${method} ${url.pathname}${url.search}`);
  await route.abort();
});

const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', error => pageErrors.push(error.message));
const waitFor = async (predicate, message) => {
  const started = Date.now();
  while (!predicate()) {
    assert.ok(Date.now() - started < 15000, message);
    await page.waitForTimeout(30);
  }
};
const noOverflow = async label => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: horizontal overflow`);
};
const selectFiles = names => page.getByLabel('选择听力音频或题目文件').setInputFiles(names.map(name => ({
  name, mimeType: name === 'fallback-without-mime.mp3' ? '' : fixtures[name].mime,
  buffer: fixtures[name].body,
})));

try {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({width, height: width >= 1000 ? 1000 : 844});
    await page.goto(origin + home);
    await page.getByRole('heading', {name: '英语', exact: true}).waitFor();
    const entry = page.getByRole('link', {name: /11月9日听力/});
    assert.equal(await entry.count(), 1);
    assert.equal(await entry.getAttribute('href'), dated);
    await entry.scrollIntoViewIfNeeded();
    await noOverflow(`home-${width}`);
    await page.screenshot({path: path.join(output, `home-${width}.png`)});
    await entry.click();
    await page.getByRole('heading', {name: '11月9日听力', exact: true}).waitFor();
    await page.getByText('暂未添加音频。添加后即可在这里播放。', {exact: true}).waitFor();
    await page.getByText('暂未添加题目或资料，可添加题目图片、PDF。', {exact: true}).waitFor();
    await noOverflow(`empty-${width}`);
    assert.equal(state.createCalls, 0, 'Read-only navigation must not create a date unit');
    await page.screenshot({path: path.join(output, `empty-${width}.png`), fullPage: true});
    await page.getByRole('link', {name: '← 返回英语主页', exact: true}).click();
    await page.getByRole('heading', {name: '英语', exact: true}).waitFor();
  }
  checks.push('320-390-1440-home-entry-roundtrip-and-no-overflow', 'empty-date-navigation-has-no-writes');

  await page.setViewportSize({width: 390, height: 844});
  await page.goto(origin + dated);
  await page.getByText('暂未添加音频。添加后即可在这里播放。', {exact: true}).waitFor();
  await selectFiles(['november-9-listening.wav', 'november-9-questions.png', 'november-9-worksheet.pdf']);
  await page.getByText('已添加3个文件。', {exact: true}).waitFor();
  assert.equal(state.createCalls, 1);
  assert.equal(state.materialLog.length, 3);
  const audio = page.locator('audio');
  assert.equal(await audio.count(), 1);
  assert.equal(await audio.getAttribute('src'), '/api/files/synthetic/november-9-listening.wav');
  await page.waitForFunction(() => document.querySelector('audio')?.readyState >= 1);
  assert.ok(await audio.evaluate(element => Math.abs(element.duration - 1) < 0.1), 'Synthetic WAV metadata is playable');
  await page.getByRole('img', {name: 'november-9-questions.png', exact: true}).waitFor();
  assert.equal(await page.getByRole('link', {name: '打开PDF题目', exact: true}).getAttribute('href'), '/api/files/synthetic/november-9-worksheet.pdf');
  await noOverflow('uploaded-390');
  await page.screenshot({path: path.join(output, 'uploaded-390.png'), fullPage: true});
  checks.push('audio-image-pdf-upload-association-and-playable-audio-metadata');

  const writesBeforeRefresh = state.materialLog.length;
  await page.reload();
  await page.getByRole('heading', {name: 'november-9-listening.wav', exact: true}).waitFor();
  await page.getByRole('img', {name: 'november-9-questions.png', exact: true}).waitFor();
  assert.equal(state.materialLog.length, writesBeforeRefresh);
  assert.equal(state.createCalls, 1);
  checks.push('refresh-loads-persisted-synthetic-materials-without-new-writes');

  await selectFiles(['fallback-without-mime.mp3']);
  await page.getByRole('heading', {name: 'fallback-without-mime.mp3', exact: true}).waitFor();
  assert.deepEqual(state.uploadLog.at(-1), {name: 'fallback-without-mime.mp3', mime: 'audio/mpeg'});
  assert.equal(state.materialLog.at(-1).file_type, 'audio');
  checks.push('empty-mime-mp3-is-normalized-before-upload');

  state.uploadFailures.add('upload-fails.pdf');
  const beforePartial = state.materials.length;
  await selectFiles(['saved-before-error.png', 'upload-fails.pdf']);
  await page.getByRole('alert').filter({hasText: '已保存1个文件，后续文件添加失败：模拟音频存储失败'}).waitFor();
  assert.equal(state.materials.length, beforePartial + 1);
  await page.getByRole('img', {name: 'saved-before-error.png', exact: true}).waitFor();
  await page.getByRole('heading', {name: 'november-9-listening.wav', exact: true}).waitFor();
  await noOverflow('partial-error-390');
  await page.screenshot({path: path.join(output, 'partial-error-390.png'), fullPage: true});
  checks.push('partial-upload-error-retains-successful-and-existing-materials');

  state.failReads = 1;
  await page.reload();
  await page.getByRole('alert').filter({hasText: '模拟资料读取失败，请重试。'}).waitFor();
  assert.equal(await page.getByRole('button', {name: '添加音频 / 题目', exact: true}).isDisabled(), true);
  await page.getByRole('button', {name: '重新加载资料', exact: true}).click();
  await page.getByRole('heading', {name: 'november-9-listening.wav', exact: true}).waitFor();
  await waitFor(() => state.failReads === 0, 'Read failure should have been consumed');
  assert.equal(await page.locator('main [role="alert"]').count(), 0);
  assert.equal(await page.getByRole('button', {name: '添加音频 / 题目', exact: true}).isEnabled(), true);
  checks.push('initial-load-error-disables-upload-and-retry-restores-materials');

  for (const width of [320, 1440]) {
    await page.setViewportSize({width, height: width >= 1000 ? 1000 : 844});
    await noOverflow(`materials-${width}`);
  }
  assert.deepEqual(state.unexpectedApis, [], 'Every API request must have an explicit local mock');
  assert.deepEqual(pageErrors, [], 'Browser must not report client errors');
  const result = {passed: true, checks, syntheticUploads: state.uploadLog.length,
    syntheticMaterialWrites: state.materialLog.length, realApiRequestsForwarded: 0,
    realDatabaseWrites: 0, learnerWrites: 0, screenshots: output};
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await context.close();
  await browser.close();
}
