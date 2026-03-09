/**
 * Community Globe V2 Loader
 *
 * Loads the interactive 3D globe V2 component with morphing transitions,
 * GeoJSON country borders, OrbitControls, and semi-transparency.
 *
 * Usage:
 * <div id="community-globe"></div>
 * <script src="https://lab.iriscocreative.com/membership-hub/community-globe-v2/loader.js"></script>
 */

(function() {
    'use strict';

    var BASE_URL = 'https://lab.iriscocreative.com/membership-hub/community-globe-v2';
    var VERSION = '2.0.0';
    var config = window.CommunityGlobeConfig || {};
    var containerId = config.containerId || 'community-globe';

    var container = document.getElementById(containerId);
    if (!container) {
        console.warn('[community-globe-v2] Container #' + containerId + ' not found');
        return;
    }

    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:400px;color:#7a7a7a;background:#000;">Loading Globe...</div>';

    function waitForMembershipCore(timeout) {
        timeout = timeout || 10000;
        return new Promise(function(resolve) {
            if (window.MembershipCore && window.MembershipCore.supabaseClient) {
                return resolve(window.MembershipCore);
            }
            var startTime = Date.now();
            var checkInterval = setInterval(function() {
                if (window.MembershipCore && window.MembershipCore.supabaseClient) {
                    clearInterval(checkInterval);
                    resolve(window.MembershipCore);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    resolve(null);
                }
            }, 100);
        });
    }

    function loadCSS(url) {
        return new Promise(function(resolve) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.onload = resolve;
            link.onerror = function() { console.error('[community-globe-v2] Failed to load CSS:', url); resolve(); };
            document.head.appendChild(link);
        });
    }

    function loadScript(url) {
        return new Promise(function(resolve, reject) {
            if (url.indexOf('three.min') > -1 && window.THREE) return resolve();
            if (url.indexOf('OrbitControls') > -1 && window.THREE && window.THREE.OrbitControls) return resolve();
            var script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = function() { reject(new Error('Failed to load: ' + url)); };
            document.body.appendChild(script);
        });
    }

    async function load() {
        try {
            var membershipCore = await waitForMembershipCore();
            if (membershipCore) {
                console.log('[community-globe-v2] MembershipCore loaded');
            } else {
                console.log('[community-globe-v2] MembershipCore not available');
            }

            // Load Three.js, then OrbitControls, then land data, then component CSS + JS
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
            await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
            await loadScript(BASE_URL + '/land-data.js?' + VERSION);
            await loadCSS(BASE_URL + '/community-globe-v2.css?' + VERSION);
            await loadScript(BASE_URL + '/community-globe-v2.js?' + VERSION);

            if (typeof window.CommunityGlobe !== 'undefined') {
                window.CommunityGlobe.init({ containerId: containerId });
            }
        } catch (error) {
            console.error('[community-globe-v2] Error during initialization', error);
            container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;gap:1rem;text-align:center;padding:2rem;background:#000;color:#a0dce4;">' +
                '<h3 style="font-size:1.25rem;font-weight:600;">Error Loading Globe</h3>' +
                '<p style="color:#1a8898;">Please try refreshing the page.</p></div>';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', load);
    } else {
        load();
    }
})();
