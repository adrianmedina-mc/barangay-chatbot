/**
 * locationParser.js
 * Extracts latitude and longitude from any Google Maps URL the user might paste.
 *
 * Supported URL formats:
 *   1. https://maps.app.goo.gl/xxxxx          (short link — needs HTTP redirect follow)
 *   2. https://www.google.com/maps?q=14.1,122.5
 *   3. https://www.google.com/maps/place/.../@14.1,122.5,17z
 *   4. https://maps.google.com/?ll=14.1,122.5
 *   5. https://www.google.com/maps/@14.1,122.5,17z
 *   6. Bare coordinates typed by user: "14.1234, 122.5678"
 */

const https = require('https');
const http  = require('http');

/**
 * Follow a short URL (maps.app.goo.gl) and return the final expanded URL.
 * Times out after 5 seconds.
 */
function expandShortUrl(shortUrl) {
  return new Promise((resolve, reject) => {
    const lib = shortUrl.startsWith('https') ? https : http;
    const req = lib.get(shortUrl, { timeout: 5000 }, (res) => {
      // Google short links redirect with 301/302
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(res.headers.location);
      }
      // If no redirect, return the original (maybe it already resolved)
      resolve(shortUrl);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout expanding short URL')); });
  });
}

/**
 * Try to extract lat/lng from a fully-expanded Google Maps URL string.
 * Returns { lat, lng } or null.
 */
function extractCoordsFromUrl(url) {
  // Pattern 1: ?q=lat,lng  or  ?q=lat%2Clng
  const qParam = url.match(/[?&]q=(-?\d+\.?\d*)[,+](-?\d+\.?\d*)/);
  if (qParam) return { lat: parseFloat(qParam[1]), lng: parseFloat(qParam[2]) };

  // Pattern 2: /@lat,lng,zoom
  const atSign = url.match(/\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atSign) return { lat: parseFloat(atSign[1]), lng: parseFloat(atSign[2]) };

  // Pattern 3: ?ll=lat,lng
  const llParam = url.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (llParam) return { lat: parseFloat(llParam[1]), lng: parseFloat(llParam[2]) };

  // Pattern 4: /place/Name/@lat,lng  (already caught by atSign above, but just in case)
  const placeAt = url.match(/\/place\/[^/@]+\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (placeAt) return { lat: parseFloat(placeAt[1]), lng: parseFloat(placeAt[2]) };

  return null;
}

/**
 * Try to extract lat/lng from plain text (user typed coordinates).
 * Accepts:  "14.1234, 122.5678"  or  "14.1234 122.5678"
 * Returns { lat, lng } or null.
 */
function extractCoordsFromText(text) {
  const match = text.match(/^(-?\d{1,3}\.?\d*)[,\s]+(-?\d{1,3}\.?\d*)$/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  // Basic sanity: lat -90..90, lng -180..180
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Main export.
 * Pass the raw text the user sent.
 * Returns { lat, lng } if coordinates found, or null if not.
 */
async function parseLocation(text) {
  const trimmed = (text || '').trim();

  // 1. Check if the text itself looks like bare coordinates
  const fromText = extractCoordsFromText(trimmed);
  if (fromText) return fromText;

  // 2. Check if it contains a URL
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return null;

  let url = urlMatch[0];

  // 3. Expand short URLs (maps.app.goo.gl)
  if (url.includes('maps.app.goo.gl') || url.includes('goo.gl')) {
    try {
      url = await expandShortUrl(url);
    } catch (e) {
      // If expansion fails, try parsing the short URL directly (won't work but safe)
      console.error('Short URL expansion failed:', e.message);
      return null;
    }
  }

  // 4. Extract from the expanded URL
  return extractCoordsFromUrl(url);
}

module.exports = { parseLocation };