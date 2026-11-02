// @vitest-environment jsdom
/**
 * sd-card-panel-copy.test.ts — the SD panel exposes uploads without a paid gate.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SdCardPanel } from '../components/simulator/SdCardPanel';
import { installSdCardUploadGate } from '../lib/proSdCardGate';

afterEach(() => installSdCardUploadGate(null));

const render = () =>
  renderToStaticMarkup(createElement(SdCardPanel, { files: [], onChange: () => {}, boardId: null }));

describe('SdCardPanel upload access', () => {
  it('keeps file and folder uploads available despite a legacy blocking gate', () => {
    installSdCardUploadGate(() => false);
    const html = render();
    expect(html).toContain('+ Add files<');
    expect(html).toContain('+ Add folder');
    expect(html).not.toContain('(paid)');
    expect(html).toContain('Upload your own files');
    expect(html).not.toContain('Paid');
    expect(html).not.toContain('paid plan');
  });
});
