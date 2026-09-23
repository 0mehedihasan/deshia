import { describe, expect, it } from 'vitest';
import { escapeXml, generateVocXml } from '@/core/exporter/voc';

describe('Pascal VOC XML', () => {
  const doc = {
    folder: 'images',
    filename: 'annotated_rickshaw_side_003.jpg',
    path: '/out/DeshiA_Output/ANNOTATED/rickshaw/side/images/annotated_rickshaw_side_003.jpg',
    size: { width: 800, height: 600 },
    objects: [
      { name: 'rickshaw_body', box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.8 } },
      { name: 'chain', box: { xMin: 0.5, yMin: 0.6, xMax: 0.7, yMax: 0.75 }, difficult: true },
    ],
  };

  it('emits a well-formed VOC document with size and objects', () => {
    const xml = generateVocXml(doc);
    expect(xml).toContain('<annotation>');
    expect(xml).toContain('<width>800</width>');
    expect(xml).toContain('<height>600</height>');
    expect(xml).toContain('<depth>3</depth>');
    expect(xml).toContain('<name>rickshaw_body</name>');
    expect(xml).toContain('<name>chain</name>');
    expect((xml.match(/<object>/g) ?? []).length).toBe(2);
  });

  it('converts normalized boxes to 1-based inclusive VOC pixels', () => {
    const xml = generateVocXml(doc);
    // rickshaw_body: xMin 0.1*800=80 → +1 = 81; xMax 0.5*800=400
    expect(xml).toContain('<xmin>81</xmin>');
    expect(xml).toContain('<xmax>400</xmax>');
    // yMin 0.2*600=120 → +1 = 121; yMax 0.8*600=480
    expect(xml).toContain('<ymin>121</ymin>');
    expect(xml).toContain('<ymax>480</ymax>');
  });

  it('marks difficult for OCCLUDED-derived objects', () => {
    const xml = generateVocXml(doc);
    expect(xml).toContain('<difficult>1</difficult>');
    expect(xml).toContain('<difficult>0</difficult>');
  });

  it('escapes XML-special characters', () => {
    expect(escapeXml('a & b < c > "d" \'e\'')).toBe('a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;');
  });
});
