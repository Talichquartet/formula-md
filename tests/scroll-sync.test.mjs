import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  annotateTokens,
  createAnchorMap,
  previewOffsetForLine,
  sourceLineForOffset
} = require('../src/renderer/scroll-sync.js');

function token(type, nesting, map, block = true) {
  return { type, nesting, map, block, attrs: null };
}

function attributeValue(item, name) {
  return item.attrs?.find((attribute) => attribute[0] === name)?.[1];
}

test('Markdown block tokens receive remapped original source line ranges', () => {
  const paragraph = token('paragraph_open', 1, [1, 2]);
  const inline = token('inline', 0, [1, 2]);
  const fence = token('fence', 0, [2, 3]);
  const html = token('html_block', 0, [3, 4]);

  const count = annotateTokens([paragraph, inline, fence, html], [0, 1, 4, 5, 6]);

  assert.equal(count, 2);
  assert.equal(attributeValue(paragraph, 'data-source-start'), '1');
  assert.equal(attributeValue(paragraph, 'data-source-end'), '4');
  assert.equal(attributeValue(fence, 'data-source-start'), '4');
  assert.equal(attributeValue(fence, 'data-source-end'), '5');
  assert.equal(inline.attrs, null);
  assert.equal(html.attrs, null);
});

test('anchor map favors concrete block starts and stays visually monotonic', () => {
  const anchors = createAnchorMap(
    [
      { line: 0, offset: 80, kind: 'start' },
      { line: 4, offset: 260, kind: 'end' },
      { line: 4, offset: 250, kind: 'start' },
      { line: 8, offset: 240, kind: 'start' }
    ],
    10,
    35,
    500
  );

  assert.deepEqual(anchors, [
    { line: 0, offset: 80 },
    { line: 4, offset: 250 },
    { line: 8, offset: 250 },
    { line: 10, offset: 500 }
  ]);
});

test('source lines and preview offsets interpolate in both directions', () => {
  const anchors = [
    { line: 0, offset: 50 },
    { line: 10, offset: 250 },
    { line: 20, offset: 650 }
  ];

  assert.equal(previewOffsetForLine(anchors, 5), 150);
  assert.equal(previewOffsetForLine(anchors, 15), 450);
  assert.equal(sourceLineForOffset(anchors, 150), 5);
  assert.equal(sourceLineForOffset(anchors, 450), 15);
  assert.equal(sourceLineForOffset(anchors, -20), 0);
  assert.equal(previewOffsetForLine(anchors, 100), 650);
});
