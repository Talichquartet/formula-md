(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ScrollSync = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const START_ATTRIBUTE = 'data-source-start';
  const END_ATTRIBUTE = 'data-source-end';

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function remapLineBoundary(line, lineMap) {
    if (!Array.isArray(lineMap) || lineMap.length === 0) return line;
    const index = clamp(Math.trunc(line), 0, lineMap.length - 1);
    return Number.isFinite(lineMap[index]) ? lineMap[index] : line;
  }

  function setTokenAttribute(token, name, value) {
    if (typeof token.attrSet === 'function') {
      token.attrSet(name, String(value));
      return;
    }
    if (!Array.isArray(token.attrs)) token.attrs = [];
    const current = token.attrs.find((attribute) => attribute[0] === name);
    if (current) current[1] = String(value);
    else token.attrs.push([name, String(value)]);
  }

  function annotateTokens(tokens, lineMap) {
    let annotated = 0;
    for (const token of tokens || []) {
      const isOpeningBlock = token?.nesting === 1 && token.block;
      const isStandaloneBlock =
        token?.nesting === 0 && token.block && token.type !== 'inline' && token.type !== 'html_block';
      if ((!isOpeningBlock && !isStandaloneBlock) || !Array.isArray(token.map)) continue;

      const start = remapLineBoundary(token.map[0], lineMap);
      const end = Math.max(start, remapLineBoundary(token.map[1], lineMap));
      setTokenAttribute(token, START_ATTRIBUTE, start);
      setTokenAttribute(token, END_ATTRIBUTE, end);
      annotated += 1;
    }
    return annotated;
  }

  function createAnchorMap(points, lineCount, startOffset, endOffset) {
    const maximumLine = Math.max(1, Math.trunc(lineCount) || 1);
    const groups = new Map();

    const addPoint = (point) => {
      if (!Number.isFinite(point?.line) || !Number.isFinite(point?.offset)) return;
      const line = clamp(point.line, 0, maximumLine);
      const kind = point.kind === 'end' ? 'end' : point.kind === 'boundary' ? 'boundary' : 'start';
      if (!groups.has(line)) groups.set(line, { starts: [], ends: [], boundaries: [] });
      const group = groups.get(line);
      if (kind === 'start') group.starts.push(point.offset);
      else if (kind === 'end') group.ends.push(point.offset);
      else group.boundaries.push(point.offset);
    };

    for (const point of points || []) addPoint(point);
    addPoint({ line: 0, offset: startOffset, kind: 'boundary' });
    addPoint({ line: maximumLine, offset: endOffset, kind: 'boundary' });

    const anchors = [...groups.entries()]
      .sort(([first], [second]) => first - second)
      .map(([line, group]) => {
        let offset;
        if (line === maximumLine && group.boundaries.length) {
          offset = Math.max(...group.boundaries, ...group.ends, ...group.starts);
        } else if (group.starts.length) {
          // Nested Markdown blocks often share a source line. The deepest text
          // block starts slightly lower and is the most useful visual anchor.
          offset = Math.max(...group.starts);
        } else if (group.ends.length) {
          offset = Math.max(...group.ends);
        } else {
          offset = Math.max(...group.boundaries);
        }
        return { line, offset };
      });

    let previousOffset = Number.NEGATIVE_INFINITY;
    return anchors.map((anchor) => {
      const offset = Math.max(previousOffset, anchor.offset);
      previousOffset = offset;
      return { line: anchor.line, offset };
    });
  }

  function interpolate(anchors, value, inputKey, outputKey) {
    if (!Array.isArray(anchors) || anchors.length === 0 || !Number.isFinite(value)) return 0;
    if (value <= anchors[0][inputKey]) return anchors[0][outputKey];
    const last = anchors[anchors.length - 1];
    if (value >= last[inputKey]) return last[outputKey];

    let lowerIndex = 0;
    let upperIndex = anchors.length - 1;
    while (upperIndex - lowerIndex > 1) {
      const middle = Math.floor((lowerIndex + upperIndex) / 2);
      if (anchors[middle][inputKey] <= value) lowerIndex = middle;
      else upperIndex = middle;
    }

    const lower = anchors[lowerIndex];
    const upper = anchors[upperIndex];
    const span = upper[inputKey] - lower[inputKey];
    if (span <= 0) return upper[outputKey];
    const progress = (value - lower[inputKey]) / span;
    return lower[outputKey] + progress * (upper[outputKey] - lower[outputKey]);
  }

  function previewOffsetForLine(anchors, line) {
    return interpolate(anchors, line, 'line', 'offset');
  }

  function sourceLineForOffset(anchors, offset) {
    return interpolate(anchors, offset, 'offset', 'line');
  }

  return {
    START_ATTRIBUTE,
    END_ATTRIBUTE,
    annotateTokens,
    createAnchorMap,
    previewOffsetForLine,
    sourceLineForOffset
  };
});
