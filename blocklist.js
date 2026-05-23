// A compact, hand-picked list of ad / tracker host fragments.
// A request is blocked when its hostname ends with one of these entries.
// This is intentionally small and dependency-free; swap in a full list
// (e.g. EasyList) later if you want broader coverage.
const BLOCKED_HOSTS = [
  // Google ads / analytics
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googletagservices.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  // Facebook / Meta
  'connect.facebook.net',
  'graph.facebook.com',
  'pixel.facebook.com',
  // Amazon ads
  'amazon-adsystem.com',
  // Common ad networks
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'scorecardresearch.com',
  'quantserve.com',
  'moatads.com',
  'adsrvr.org',
  'casalemedia.com',
  'openx.net',
  'smartadserver.com',
  'yieldmo.com',
  'sharethrough.com',
  'bidswitch.net',
  'serving-sys.com',
  'advertising.com',
  'adcolony.com',
  'applovin.com',
  // Trackers / analytics
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'fullstory.com',
  'mouseflow.com',
  'crazyegg.com',
  'optimizely.com',
  'amplitude.com',
  'branch.io',
  'appsflyer.com',
  'adjust.com',
  'kochava.com',
  'newrelic.com',
  'nr-data.net',
  'sentry.io',
  'bugsnag.com',
  'chartbeat.com',
  'parsely.com',
  'clarity.ms',
  'demdex.net',
  'omtrdc.net',
  '2o7.net',
  'everesttech.net',
  'krxd.net',
  'bluekai.com',
  'mathtag.com',
  'rlcdn.com',
  'agkn.com',
  'addthis.com',
  'sharethis.com',
];

function isBlockedHost(hostname) {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  for (const blocked of BLOCKED_HOSTS) {
    if (host === blocked || host.endsWith('.' + blocked)) {
      return true;
    }
  }
  return false;
}

module.exports = { BLOCKED_HOSTS, isBlockedHost };
