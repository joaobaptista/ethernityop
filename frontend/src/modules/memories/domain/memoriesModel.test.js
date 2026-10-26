import {
  INITIAL_CURATED_PHOTOS,
  SAMPLE_FIXTURE_PHOTOS,
  createCuratedPhoto,
  groupPhotosByYear,
  togglePhotoSelection,
  setAllPhotosSelection,
  calculateSelectionStats,
} from './memoriesModel.js';

describe('memoriesModel Domain Rules', () => {
  it('inicializa INITIAL_CURATED_PHOTOS como lista 100% limpa (sem dados mockados)', () => {
    expect(INITIAL_CURATED_PHOTOS).toEqual([]);
    expect(INITIAL_CURATED_PHOTOS).toHaveLength(0);
  });

  it('creates standardized CuratedPhoto entities', () => {
    const photo = createCuratedPhoto({
      img: 'https://example.com/foto.jpg',
      title: 'Pôr do Sol no Lago',
      year: 2024,
    });

    expect(photo.id).toBeDefined();
    expect(photo.img).toBe('https://example.com/foto.jpg');
    expect(photo.year).toBe(2024);
    expect(photo.selected).toBe(true);
  });

  it('rejects photo creation without an image url', () => {
    expect(() => createCuratedPhoto({})).toThrow('imagem da foto é obrigatória');
  });

  it('groups timeline photos accurately by year', () => {
    const grouped = groupPhotosByYear(SAMPLE_FIXTURE_PHOTOS, [2024, 2023]);
    expect(grouped[2024]).toBeDefined();
    expect(grouped[2023]).toBeDefined();
    expect(grouped[2024].length).toBe(2);
    expect(grouped[2023].length).toBe(2);
  });

  it('toggles selection of individual photos immutably', () => {
    const targetId = SAMPLE_FIXTURE_PHOTOS[0].id;
    const initialSelected = SAMPLE_FIXTURE_PHOTOS[0].selected;

    const toggled = togglePhotoSelection(SAMPLE_FIXTURE_PHOTOS, targetId);
    const updated = toggled.find((p) => p.id === targetId);

    expect(updated.selected).toBe(!initialSelected);
    // Original list remains unchanged
    expect(SAMPLE_FIXTURE_PHOTOS[0].selected).toBe(initialSelected);
  });

  it('selects and deselects all photos', () => {
    const allDeselected = setAllPhotosSelection(SAMPLE_FIXTURE_PHOTOS, false);
    expect(allDeselected.every((p) => !p.selected)).toBe(true);

    const allSelected = setAllPhotosSelection(SAMPLE_FIXTURE_PHOTOS, true);
    expect(allSelected.every((p) => p.selected)).toBe(true);
  });

  it('computes selection statistics accurately', () => {
    const samplePhotos = [
      { id: '1', selected: true },
      { id: '2', selected: true },
      { id: '3', selected: false },
    ];
    const stats = calculateSelectionStats(samplePhotos);
    expect(stats.totalCount).toBe(3);
    expect(stats.selectedCount).toBe(2);
    expect(stats.isAllSelected).toBe(false);

    const allSelected = setAllPhotosSelection(samplePhotos, true);
    const fullStats = calculateSelectionStats(allSelected);
    expect(fullStats.isAllSelected).toBe(true);
  });
});
