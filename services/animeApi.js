// API Service Layer proxying to our AnOvA service
// Base URL: https://backup--idplaypoinbdb.replit.app

import { anovaApi } from '../src/services/anovaApi';

export const animeApi = {
  getHome: () => anovaApi.getHome(),
  getSeries: (page) => anovaApi.getSeries(page),
  getMovies: (page) => anovaApi.getMovies(page),
  search: (query) => anovaApi.search(query),
  getInfo: (id) => anovaApi.getInfo(id),
  getEpisodes: (id, season) => anovaApi.getEpisodes(id, season),
  getStream: (id, season, ep) => anovaApi.getStream(id, season, ep),
  getMovieStream: (id) => anovaApi.getMovieStream(id),
  getDownload: (id, season, ep) => anovaApi.getDownload(id, season, ep),
  resolveAnovaId: (id, title) => anovaApi.resolveAnovaId(id, title)
};

export default animeApi;
