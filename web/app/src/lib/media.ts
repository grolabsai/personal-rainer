// Exercise media is © Gym visual (https://gymvisual.com/), shown with attribution. It is loaded from the
// exercises-dataset repository at the commit the catalog was imported from; nothing is re-hosted here.
const DATASET = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/7455efae41b330c265e7cd4b78dfa848e7ce5ebd';

export const mediaUrl = (path: string | null | undefined) => (path ? `${DATASET}/${path}` : '');
