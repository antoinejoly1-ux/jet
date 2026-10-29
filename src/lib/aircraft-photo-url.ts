/** Where an aircraft's uploaded photo is served; the file id busts the cache when it changes. */
export const aircraftPhotoUrl = (aircraftId: string, fileId: string | null) =>
  fileId ? `/aircraft-photos/${aircraftId}?v=${fileId}` : null;
