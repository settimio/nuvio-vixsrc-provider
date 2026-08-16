// Standalone VixSrc provider for Nuvio.
// Based on the public Nuvio provider pattern used by plugins_nuvio.
// No npm dependencies are required.

const BASE_URL = "https://vixsrc.to";

function request(url, options = {}) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.5",
    ...(options.headers || {})
  };

  return fetch(url, {
    method: options.method || "GET",
    ...options,
    headers
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  });
}

function buildVixSrcUrl(tmdbId, mediaType, seasonNum, episodeNum) {
  if (mediaType === "tv") {
    if (seasonNum == null || episodeNum == null) {
      throw new Error("TV requests require season and episode numbers");
    }
    return `${BASE_URL}/tv/${tmdbId}/${seasonNum}/${episodeNum}`;
  }

  return `${BASE_URL}/movie/${tmdbId}`;
}

function extractMasterPlaylist(html) {
  // VixSrc commonly exposes a master-playlist config in the page.
  const masterBlock = html.match(/window\.masterPlaylist\s*=\s*\{([\s\S]*?)\}/i);

  if (masterBlock) {
    const block = masterBlock[1];
    const urlMatch = block.match(/url\s*:\s*["']([^"']+)["']/i);
    const tokenMatch = block.match(/["']?token["']?\s*:\s*["']([^"']+)["']/i);
    const expiresMatch = block.match(/["']?expires["']?\s*:\s*["']([^"']+)["']/i);

    if (urlMatch && tokenMatch && expiresMatch) {
      const base = urlMatch[1];
      const join = base.includes("?") ? "&" : "?";
      return `${base}${join}token=${encodeURIComponent(tokenMatch[1])}` +
        `&expires=${encodeURIComponent(expiresMatch[1])}&h=1&lang=en`;
    }
  }

  // Fallback for pages exposing a direct HLS URL.
  const direct = html.match(/https?:\/\/[^"'\\\s<>]+(?:\.m3u8|\/playlist\/)[^"'\\\s<>]*/i);
  return direct ? direct[0].replace(/\\u0026/g, "&").replace(/\\\//g, "/") : null;
}

function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  let pageUrl;

  try {
    pageUrl = buildVixSrcUrl(tmdbId, mediaType, seasonNum, episodeNum);
  } catch (error) {
    console.error(`[Vixsrc] ${error.message}`);
    return Promise.resolve([]);
  }

  console.log(`[Vixsrc] Fetching ${pageUrl}`);

  return request(pageUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  })
    .then((response) => response.text())
    .then((html) => {
      const streamUrl = extractMasterPlaylist(html);

      if (!streamUrl) {
        console.log("[Vixsrc] No playable HLS playlist found");
        return [];
      }

      return [
        {
          name: "Vixsrc",
          title: "Auto Quality",
          url: streamUrl,
          quality: "Auto",
          type: "direct",
          headers: {
            Referer: `${BASE_URL}/`,
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        }
      ];
    })
    .catch((error) => {
      console.error(`[Vixsrc] ${error.message}`);
      return [];
    });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.VixsrcScraperModule = { getStreams };
}
