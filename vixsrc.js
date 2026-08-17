// Standalone VixSrc provider for Nuvio.
// Uses VixSrc's current API -> embed-page flow.

const BASE_URL = "https://vixsrc.to";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function request(url, options = {}) {
  const headers = {
    "User-Agent": USER_AGENT,
    ...(options.headers || {})
  };

  return fetch(url, {
    method: options.method || "GET",
    ...options,
    headers
  }).then((response) => {
    if (!response.ok) {
      const error = new Error(
        `HTTP ${response.status}: ${response.statusText}`
      );
      error.status = response.status;
      throw error;
    }

    return response;
  });
}

function buildApiUrl(
  tmdbId,
  mediaType,
  seasonNum,
  episodeNum,
  language = "en"
) {
  if (!tmdbId) {
    throw new Error("TMDB id is required");
  }

  let path;

  if (mediaType === "tv") {
    if (seasonNum == null || episodeNum == null) {
      throw new Error("TV requests require season and episode numbers");
    }

    path = `/api/tv/${tmdbId}/${seasonNum}/${episodeNum}`;
  } else {
    path = `/api/movie/${tmdbId}`;
  }

  return `${BASE_URL}${path}?lang=${encodeURIComponent(language)}`;
}

function resolveUrl(pathOrUrl) {
  if (!pathOrUrl) return null;

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return `${BASE_URL}/${String(pathOrUrl).replace(/^\/+/, "")}`;
}

function fetchEmbedDescriptor(apiUrl) {
  return request(apiUrl, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE_URL}/`
    }
  })
    .then((response) => response.json())
    .then((data) => {
      if (
        !data ||
        typeof data.src !== "string" ||
        !data.src.trim()
      ) {
        throw new Error(
          "VixSrc API response did not contain a valid src field"
        );
      }

      return {
        src: data.src,
        embedUrl: resolveUrl(data.src)
      };
    });
}

function loadEmbedPage(embedUrl) {
  return request(embedUrl, {
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE_URL}/`
    }
  }).then((response) => response.text());
}

function validateEmbedPage(embedUrl, apiUrl) {
  return loadEmbedPage(embedUrl)
    .then((html) => ({
      html,
      embedUrl
    }))
    .catch((error) => {
      if (error && error.status === 410) {
        console.log(
          "[Vixsrc] Embed expired with HTTP 410; requesting fresh src"
        );

        return fetchEmbedDescriptor(apiUrl).then((fresh) =>
          loadEmbedPage(fresh.embedUrl).then((html) => ({
            html,
            embedUrl: fresh.embedUrl
          }))
        );
      }

      throw error;
    });
}

function getStreams(
  tmdbId,
  mediaType = "movie",
  seasonNum = null,
  episodeNum = null
) {
  let apiUrl;

  try {
    apiUrl = buildApiUrl(
      tmdbId,
      mediaType,
      seasonNum,
      episodeNum,
      "en"
    );
  } catch (error) {
    console.error(`[Vixsrc] ${error.message}`);
    return Promise.resolve([]);
  }

  console.log(`[Vixsrc] API request: ${apiUrl}`);

  return fetchEmbedDescriptor(apiUrl)
    .then((descriptor) => {
      console.log(`[Vixsrc] Embed URL: ${descriptor.embedUrl}`);

      return validateEmbedPage(
        descriptor.embedUrl,
        apiUrl
      );
    })
    .then(({ html, embedUrl }) => {
      if (!html || html.length < 20) {
        console.log("[Vixsrc] Embed page was empty");
        return [];
      }

      console.log(
        `[Vixsrc] Embed page loaded successfully (${html.length} chars)`
      );

      return [
        {
          name: "Vixsrc",
          title: "VixSrc Player",
          url: embedUrl,
          quality: "Auto",
          type: "web",
          headers: {
            Referer: `${BASE_URL}/`,
            "User-Agent": USER_AGENT
          }
        }
      ];
    })
    .catch((error) => {
      console.error(`[Vixsrc] ${error.message}`);
      return [];
    });
}

if (
  typeof module !== "undefined" &&
  module.exports
) {
  module.exports = {
    getStreams
  };
} else {
  global.VixsrcScraperModule = {
    getStreams
  };
}
