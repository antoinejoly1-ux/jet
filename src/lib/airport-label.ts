/** "Teterboro Airport", or "Boston · General Edward Lawrence Logan International Airport" when the name doesn't say the city. */
export const airportLabel = (a: { name: string; city: string }) =>
  !a.city || a.name.toLowerCase().includes(a.city.toLowerCase()) ? a.name : `${a.city} · ${a.name}`;
