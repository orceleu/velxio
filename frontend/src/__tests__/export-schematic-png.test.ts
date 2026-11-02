// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { exportSchematicPng } from '../utils/exportSchematicPng';

const originalBoards = useSimulatorStore.getState().boards;
const originalComponents = useSimulatorStore.getState().components;
const createdBlobs: Blob[] = [];
const downloads: Array<{ href: string; filename: string }> = [];

beforeEach(() => {
  createdBlobs.length = 0;
  downloads.length = 0;
  useSimulatorStore.setState({
    boards: [],
    components: [{ id: 'part-1', metadataId: 'resistor', x: 100, y: 150, properties: {} }],
  });

  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((blob: Blob) => {
      createdBlobs.push(blob as Blob);
      return `blob:${createdBlobs.length}`;
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['png'], { type: 'image/png' }));
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    downloads.push({ href: this.href, filename: this.download });
  });

  const canvas = document.createElement('div');
  canvas.className = 'canvas-content';
  canvas.style.backgroundColor = 'rgb(255, 255, 255)';
  canvas.getBoundingClientRect = () =>
    ({ left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 }) as DOMRect;

  const world = document.createElement('div');
  world.className = 'canvas-world';
  world.style.transform = 'matrix(2, 0, 0, 2, 30, 40)';
  const component = document.createElement('div');
  component.dataset.componentId = 'part-1';
  component.getBoundingClientRect = () =>
    ({ left: 330, top: 390, right: 530, bottom: 550, width: 200, height: 160 }) as DOMRect;
  const componentSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  componentSvg.setAttribute('viewBox', '0 0 10 8');
  componentSvg.style.width = '10px';
  componentSvg.style.height = '8px';
  componentSvg.innerHTML = '<rect id="body" width="10" height="8" fill="#f00"></rect>';
  componentSvg.getBoundingClientRect = () =>
    ({ left: 420, top: 460, right: 440, bottom: 476, width: 20, height: 16 }) as DOMRect;
  const componentContainer = document.createElement('div');
  componentContainer.className = 'web-component-container';
  componentContainer.appendChild(componentSvg);
  component.appendChild(componentContainer);
  world.appendChild(component);
  canvas.appendChild(world);
  document.body.appendChild(canvas);
});

afterEach(() => {
  useSimulatorStore.setState({ boards: originalBoards, components: originalComponents });
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('exportSchematicPng', () => {
  it('renders the complete schematic bounds and downloads a PNG without a saved project', async () => {
    await exportSchematicPng('circuit.png');

    expect(createdBlobs).toHaveLength(2);
    expect(createdBlobs[0].type).toBe('image/svg+xml;charset=utf-8');
    const svg = await createdBlobs[0].text();
    expect(svg).toContain('viewBox="0 0 164 144"');
    expect(svg).not.toContain('<foreignObject');
    expect(svg).toContain('<rect');
    expect(downloads).toEqual([{ href: 'blob:2', filename: 'circuit.png' }]);
  });

  it('reports an empty canvas instead of downloading an empty image', async () => {
    useSimulatorStore.setState({ components: [], boards: [] });
    await expect(exportSchematicPng('empty.png')).rejects.toThrow(
      'Add a board or component to the canvas before exporting.',
    );
    expect(downloads).toHaveLength(0);
  });
});
