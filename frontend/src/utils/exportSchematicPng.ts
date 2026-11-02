import { useSimulatorStore } from '../store/useSimulatorStore';
import { boardSize } from './boardGeometry';

const MAX_IMAGE_DIMENSION = 4096;
const MAX_IMAGE_PIXELS = 16_777_216;
const SCENE_PADDING = 32;

interface WorldTransform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

function readWorldTransform(world: HTMLElement): WorldTransform {
  const transform = window.getComputedStyle(world).transform;
  if (!transform || transform === 'none') {
    return { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 };
  }

  const matrix = /^matrix\(([^)]+)\)$/.exec(transform);
  if (matrix) {
    const values = matrix[1].split(',').map(Number);
    return {
      scaleX: values[0],
      scaleY: values[3],
      translateX: values[4],
      translateY: values[5],
    };
  }

  const matrix3d = /^matrix3d\(([^)]+)\)$/.exec(transform);
  if (matrix3d) {
    const values = matrix3d[1].split(',').map(Number);
    return {
      scaleX: values[0],
      scaleY: values[5],
      translateX: values[12],
      translateY: values[13],
    };
  }

  throw new Error('The canvas transform could not be read.');
}

const SVG_STYLE_PROPERTIES = [
  'color',
  'display',
  'fill',
  'fill-opacity',
  'fill-rule',
  'filter',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'opacity',
  'paint-order',
  'shape-rendering',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'visibility',
];

function findRenderedSvgs(root: Element): SVGSVGElement[] {
  const svgs: SVGSVGElement[] = [];

  const visit = (node: Element | ShadowRoot) => {
    if (node instanceof SVGSVGElement) {
      svgs.push(node);
      return;
    }
    if (node instanceof Element && node.shadowRoot) visit(node.shadowRoot);
    for (const child of node.children) {
      if (child instanceof SVGSVGElement) {
        svgs.push(child);
        continue;
      }
      if (child.shadowRoot) visit(child.shadowRoot);
      visit(child);
    }
  };

  visit(root);
  return svgs;
}

function cloneRenderedSvg(source: SVGSVGElement, prefix: string): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const sourceElements = [source, ...Array.from(source.querySelectorAll('*'))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll('*'))];
  const ids = new Map<string, string>();

  sourceElements.forEach((element, index) => {
    const id = element.getAttribute('id');
    if (id) ids.set(id, `${prefix}-${id}`);

    const computed = window.getComputedStyle(element);
    const cloneElement = cloneElements[index] as SVGElement;
    SVG_STYLE_PROPERTIES.forEach((property) => {
      const value = computed.getPropertyValue(property);
      if (value) cloneElement.style.setProperty(property, value);
    });
  });

  cloneElements.forEach((element) => {
    const id = element.getAttribute('id');
    if (id) element.setAttribute('id', ids.get(id)!);
    for (const attribute of Array.from(element.attributes)) {
      let value = attribute.value;
      ids.forEach((replacement, original) => {
        const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        value = value.replace(new RegExp(`#${escaped}(?![\\w-])`, 'g'), `#${replacement}`);
      });
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
    if (element.tagName.toLowerCase() === 'style') {
      let css = element.textContent ?? '';
      ids.forEach((replacement, original) => {
        const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        css = css.replace(new RegExp(`#${escaped}(?![\\w-])`, 'g'), `#${replacement}`);
      });
      element.textContent = css;
    }
  });

  return clone;
}

function computedSvgSize(svg: SVGSVGElement): { width: number; height: number } {
  const style = window.getComputedStyle(svg);
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('A schematic item has invalid image dimensions.');
  }
  return { width, height };
}

function toWorldPoint(
  x: number,
  y: number,
  canvasRect: DOMRect,
  transform: WorldTransform,
): { x: number; y: number } {
  return {
    x: (x - canvasRect.left - transform.translateX) / transform.scaleX,
    y: (y - canvasRect.top - transform.translateY) / transform.scaleY,
  };
}

function rotatePoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
  degrees: number,
): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: center.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
}

function getSceneBounds(
  world: HTMLElement,
  canvas: HTMLElement,
  transform: WorldTransform,
): { minX: number; minY: number; width: number; height: number } {
  if (!transform.scaleX || !transform.scaleY) {
    throw new Error('The canvas zoom is invalid.');
  }

  const state = useSimulatorStore.getState();
  const componentIds = new Set(state.components.map((component) => component.id));
  const boardIds = new Set(state.boards.map((board) => board.id));
  const canvasRect = canvas.getBoundingClientRect();
  const candidates = Array.from(
    world.querySelectorAll<HTMLElement>('[data-component-id], [data-board-id], [id]'),
  ).filter(
    (element) =>
      componentIds.has(element.dataset.componentId ?? '') ||
      boardIds.has(element.dataset.boardId ?? '') ||
      boardIds.has(element.id),
  );

  if (candidates.length === 0) {
    throw new Error('Add a board or component to the canvas before exporting.');
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of candidates) {
    const rect = element.getBoundingClientRect();
    const x1 = (rect.left - canvasRect.left - transform.translateX) / transform.scaleX;
    const y1 = (rect.top - canvasRect.top - transform.translateY) / transform.scaleY;
    const x2 = (rect.right - canvasRect.left - transform.translateX) / transform.scaleX;
    const y2 = (rect.bottom - canvasRect.top - transform.translateY) / transform.scaleY;
    minX = Math.min(minX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2);
    maxY = Math.max(maxY, y1, y2);
  }

  minX -= SCENE_PADDING;
  minY -= SCENE_PADDING;
  maxX += SCENE_PADDING;
  maxY += SCENE_PADDING;
  return {
    minX,
    minY,
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  };
}

function renderToPng(svg: SVGSVGElement, width: number, height: number): Promise<Blob> {
  const serialized = new XMLSerializer().serializeToString(svg);
  const svgUrl = URL.createObjectURL(
    new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }),
  );

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(
          1,
          MAX_IMAGE_DIMENSION / width,
          MAX_IMAGE_DIMENSION / height,
          Math.sqrt(MAX_IMAGE_PIXELS / (width * height)),
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(width * scale));
        canvas.height = Math.max(1, Math.ceil(height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          URL.revokeObjectURL(svgUrl);
          reject(new Error('The browser could not create an image canvas.'));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(svgUrl);
          if (!blob) {
            reject(new Error('The browser could not encode the PNG image.'));
            return;
          }
          resolve(blob);
        }, 'image/png');
      } catch (error) {
        URL.revokeObjectURL(svgUrl);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('The schematic could not be rendered as an image.'));
    };
    image.src = svgUrl;
  });
}

export async function exportSchematicPng(filename: string): Promise<void> {
  const canvas = document.querySelector<HTMLElement>('.canvas-content');
  const world = canvas?.querySelector<HTMLElement>('.canvas-world');
  if (!canvas || !world) {
    throw new Error('The schematic canvas is not available.');
  }

  const transform = readWorldTransform(world);
  const bounds = getSceneBounds(world, canvas, transform);
  const canvasRect = canvas.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(bounds.width));
  svg.setAttribute('height', String(bounds.height));
  svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', '100%');
  background.setAttribute('height', '100%');
  background.setAttribute('fill', window.getComputedStyle(canvas).backgroundColor);
  svg.appendChild(background);

  const scene = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  scene.setAttribute('transform', `translate(${-bounds.minX} ${-bounds.minY})`);
  svg.appendChild(scene);

  const wireLayer = world.querySelector<SVGSVGElement>(':scope > .wire-layer');
  if (wireLayer) {
    const wireCopy = wireLayer.cloneNode(true) as SVGSVGElement;
    wireCopy.setAttribute('x', '0');
    wireCopy.setAttribute('y', '0');
    wireCopy.setAttribute('width', window.getComputedStyle(world).width);
    wireCopy.setAttribute('height', window.getComputedStyle(world).height);
    wireCopy.removeAttribute('style');
    scene.appendChild(wireCopy);
  }

  const state = useSimulatorStore.getState();
  let svgIndex = 0;
  const appendItem = (
    source: SVGSVGElement,
    center: { x: number; y: number },
    rotation: number,
  ) => {
    const size = computedSvgSize(source);
    const item = cloneRenderedSvg(source, `schematic-${svgIndex++}`);
    item.setAttribute('x', String(center.x - size.width / 2));
    item.setAttribute('y', String(center.y - size.height / 2));
    item.setAttribute('width', String(size.width));
    item.setAttribute('height', String(size.height));

    if (rotation) {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('transform', `rotate(${rotation} ${center.x} ${center.y})`);
      group.appendChild(item);
      scene.appendChild(group);
    } else {
      scene.appendChild(item);
    }
  };

  for (const board of state.boards) {
    const host = document.getElementById(board.id);
    if (!host) continue;
    const sourceSvgs = findRenderedSvgs(host);
    if (sourceSvgs.length === 0) {
      throw new Error(`The ${board.boardKind} board cannot be included in the PNG export.`);
    }
    const size = boardSize(board.boardKind);
    const center = { x: board.x + size.w / 2, y: board.y + size.h / 2 };
    sourceSvgs.forEach((source) => appendItem(source, center, board.rotation ?? 0));
  }

  for (const component of state.components) {
    const wrapper =
      Array.from(world.querySelectorAll<HTMLElement>('[data-component-id]')).find(
        (element) => element.dataset.componentId === component.id,
      ) ?? null;
    if (!wrapper) continue;
    const container = wrapper.querySelector('.web-component-container') ?? wrapper;
    const sourceSvgs = findRenderedSvgs(container);
    if (sourceSvgs.length === 0) {
      throw new Error(
        `The ${component.metadataId} component cannot be included in the PNG export.`,
      );
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const pivot = toWorldPoint(
      wrapperRect.left + wrapperRect.width / 2,
      wrapperRect.top + wrapperRect.height / 2,
      canvasRect,
      transform,
    );
    const rotation = Number(component.properties.rotation) || 0;
    sourceSvgs.forEach((source) => {
      const rect = source.getBoundingClientRect();
      const renderedCenter = toWorldPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        canvasRect,
        transform,
      );
      const unrotatedCenter = rotatePoint(renderedCenter, pivot, -rotation);
      appendItem(source, unrotatedCenter, rotation);
    });
  }

  const blob = await renderToPng(svg, bounds.width, bounds.height);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
