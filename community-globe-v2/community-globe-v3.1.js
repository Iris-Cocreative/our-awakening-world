/**
 * Our Awakening Earth — Globe V3.1
 * Interactive 3D globe with creator image cards, category filtering,
 * detailed hover cards with embeds, persistent pinned cards, pop-out player,
 * image toggle, overlap prevention, and morphing transitions.
 *
 * Connects to Supabase `creators` table.
 * Requires Three.js r128, OrbitControls, and land-data.js.
 */

(function() {
    'use strict';

    var R = 6.371;
    var FLAT_W = R * 2.2;
    var FLAT_H = R * 1.1;
    var PI = Math.PI;
    var MARKER_ALT = 0.075; // base altitude above surface (was 0.03)
    var WEBHOOK_URL = 'https://cocreative.app.n8n.cloud/webhook/0907fabd-cdc5-497c-8fba-62144cc08777';

    var GEOJSON_URL = 'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson';

    // =========================================================================
    // CATEGORY COLORS — 15 categories
    // =========================================================================
    var CATEGORY_COLORS = {
        'Musician':       '#e8786a',
        'Visual Artist':  '#9b8bf4',
        'Author':         '#5b8ecc',
        'Poet':           '#c77dba',
        'Philosopher':    '#d4a843',
        'Filmmaker':      '#e85d75',
        'Activist':       '#e07830',
        'Scientist':      '#4aa8c0',
        'Facilitator':    '#6aae7b',
        'Community':      '#5bb8a6',
        'Movement':       '#b8860b',
        'Village':        '#8fbc8f',
        'Gathering':      '#cd853f',
        'Theologian':     '#7b68ee',
        'Festival':       '#ff6b9d'
    };

    var CATEGORY_LIST = Object.keys(CATEGORY_COLORS);

    // =========================================================================
    // FILTER GROUPS — simplified to 5 buttons
    // =========================================================================
    var FILTER_GROUPS = {
        'Visual Artist': ['Visual Artist'],
        'Musician': ['Musician'],
        'Author': ['Author'],
        'Community': ['Community'],
        'Other': ['Poet','Philosopher','Filmmaker','Activist','Scientist',
                  'Facilitator','Movement','Village','Gathering','Theologian','Festival']
    };

    // =========================================================================
    // COUNTRY / CITY GEOCODING LOOKUP
    // =========================================================================
    var COUNTRY_COORDS = {
        'Ukraine': [48.38, 31.17], 'Iran': [32.43, 53.69], 'UK': [51.51, -0.13],
        'Cuba': [21.52, -77.78], 'Pakistan': [30.38, 69.35], 'Sudan': [12.86, 30.22],
        'South Africa': [-30.56, 22.94], 'USA': [37.09, -95.71], 'Kenya': [-0.02, 37.91],
        'Norway': [60.47, 8.47], 'Nepal': [28.39, 84.12], 'Australia': [-25.27, 133.78],
        'Kazakhstan': [48.02, 66.92], 'Chile': [-35.68, -71.54], 'Mongolia': [46.86, 103.85],
        'Jamaica': [18.11, -77.30], 'Guatemala': [15.78, -90.23], 'Colombia': [4.57, -74.30],
        'Bolivia': [-16.29, -63.59], 'India': [20.59, 78.96], 'Tibet': [29.65, 91.10],
        'Germany': [51.17, 10.45], 'Tonga': [-21.18, -175.20], 'New Zealand': [-40.90, 174.89],
        'Senegal': [14.50, -14.45], 'Hong Kong': [22.40, 114.11], 'Philippines': [12.88, 121.77],
        'France': [46.23, 2.21], 'Canada': [56.13, -106.35], 'Tunisia': [33.89, 9.54],
        'Peru': [-9.19, -75.02], 'Serbia': [44.02, 21.01], 'Ghana': [7.95, -1.02],
        'Indonesia': [-0.79, 113.92], 'Israel': [31.05, 34.85], 'South Korea': [35.91, 127.77],
        'Burkina Faso': [12.24, -1.56], 'Portugal': [39.40, -8.22], 'Estonia': [58.60, 25.01],
        'Belgium': [50.50, 4.47], 'Gambia': [13.44, -15.31], 'Nigeria': [9.08, 8.68],
        'Vietnam': [14.06, 108.28], 'Morocco': [31.79, -7.09], 'Iceland': [64.96, -19.02],
        'Denmark': [56.26, 9.50], 'Brazil': [-14.24, -51.93], 'Cameroon': [7.37, 12.35],
        'China': [35.86, 104.20], 'Japan': [36.20, 138.25], 'Kyrgyzstan': [41.20, 74.77],
        'Russia': [61.52, 105.32], 'Austria': [47.52, 14.55], 'Mexico': [23.63, -102.55],
        'Argentina': [-38.42, -63.62], 'Ecuador': [-1.83, -78.18], 'Palestine': [31.95, 35.23],
        'Mali': [17.57, -4.00], 'Samoa': [-13.76, -172.10], 'Scotland': [56.49, -4.20],
        'Aotearoa': [-40.90, 174.89], 'Global': [20.0, 0.0], 'Taiwan': [23.70, 120.96],
        'Spain': [40.46, -3.75], 'Italy': [41.87, 12.57], 'Greece': [39.07, 21.82],
        'Poland': [51.92, 19.15], 'Sweden': [60.13, 18.64], 'Finland': [61.92, 25.75],
        'Thailand': [15.87, 100.99], 'Myanmar': [19.76, 96.08], 'Bangladesh': [23.68, 90.36],
        'Sri Lanka': [7.87, 80.77], 'Afghanistan': [33.94, 67.71], 'Iraq': [33.22, 43.68],
        'Syria': [34.80, 38.99], 'Lebanon': [33.85, 35.86], 'Jordan': [30.59, 36.24],
        'Egypt': [26.82, 30.80], 'Ethiopia': [9.15, 40.49], 'Tanzania': [6.37, 34.89],
        'Uganda': [1.37, 32.29], 'Rwanda': [1.94, 29.87], 'DRC': [-4.04, 21.76],
        'Congo': [-0.23, 15.83], 'Mozambique': [-18.67, 35.53], 'Madagascar': [-18.77, 46.87],
        'Zimbabwe': [-19.02, 29.15], 'Zambia': [-13.13, 27.85], 'Botswana': [-22.33, 24.68],
        'Namibia': [-22.96, 18.49], 'Angola': [-11.20, 17.87], 'Somalia': [5.15, 46.20],
        'Libya': [26.34, 17.23], 'Algeria': [28.03, 1.66], 'Haiti': [18.97, -72.29],
        'Dominican Republic': [18.74, -70.16], 'Puerto Rico': [18.22, -66.59],
        'Trinidad': [10.69, -61.22], 'Barbados': [13.19, -59.54],
        'Costa Rica': [9.75, -83.75], 'Panama': [8.54, -80.78],
        'Honduras': [15.20, -86.24], 'El Salvador': [13.79, -88.90],
        'Nicaragua': [12.87, -85.21], 'Venezuela': [6.42, -66.59],
        'Uruguay': [-32.52, -55.77], 'Paraguay': [-23.44, -58.44],
        'Guyana': [4.86, -58.93], 'Suriname': [3.92, -56.03],
        'Tuva': [51.72, 94.38], 'Turkey': [39.93, 32.86]
    };

    var CITY_COORDS = {
        'London': [51.51, -0.13], 'New York': [40.71, -74.01], 'Paris': [48.86, 2.35],
        'Berlin': [52.52, 13.41], 'Tokyo': [35.68, 139.65], 'Sydney': [-33.87, 151.21],
        'Nairobi': [-1.29, 36.82], 'Lagos': [6.52, 3.38], 'Cairo': [30.04, 31.24],
        'Mumbai': [19.08, 72.88], 'Delhi': [28.61, 77.21], 'Kolkata': [22.57, 88.36],
        'Beijing': [39.90, 116.41], 'Shanghai': [31.23, 121.47], 'Seoul': [37.57, 126.98],
        'Bangkok': [13.76, 100.50], 'Singapore': [1.35, 103.82], 'Jakarta': [-6.21, 106.85],
        'Moscow': [55.76, 37.62], 'Istanbul': [41.01, 28.98], 'Cape Town': [-33.92, 18.42],
        'Johannesburg': [-26.20, 28.05], 'Buenos Aires': [-34.60, -58.38],
        'Santiago': [-33.45, -70.67], 'Lima': [-12.05, -77.04], 'Bogota': [4.71, -74.07],
        'Mexico City': [19.43, -99.13], 'Toronto': [43.65, -79.38], 'Montreal': [45.50, -73.57],
        'Vancouver': [49.28, -123.12], 'Los Angeles': [34.05, -118.24],
        'San Francisco': [37.77, -122.42], 'Austin': [30.27, -97.74],
        'Atlanta': [33.75, -84.39], 'Brooklyn': [40.68, -73.94],
        'Denver': [39.74, -104.99], 'Houston': [29.76, -95.37],
        'Las Vegas': [36.17, -115.14], 'Kyiv': [50.45, 30.52], 'Lviv': [49.84, 24.03],
        'Tehran': [35.69, 51.39], 'Reykjavik': [64.15, -21.94], 'Vienna': [48.21, 16.37],
        'Amsterdam': [52.37, 4.90], 'Brussels': [50.85, 4.35], 'Dublin': [53.35, -6.26],
        'Edinburgh': [55.95, -3.19], 'Lisbon': [38.72, -9.14], 'Barcelona': [41.39, 2.17],
        'Rome': [41.90, 12.50], 'Athens': [37.98, 23.73], 'Belgrade': [44.79, 20.47],
        'Warsaw': [52.23, 21.01], 'Prague': [50.08, 14.44], 'Budapest': [47.50, 19.04],
        'Tallinn': [59.44, 24.75], 'Apia': [-13.83, -171.76],
        'Durham': [35.99, -78.90], 'Camden': [51.54, -0.14], 'Islington': [51.54, -0.10],
        'Lewisham': [51.44, -0.01], 'Spanish Town': [17.99, -76.95],
        'Tucuman': [-26.81, -65.22], 'Yaound\u00e9': [3.87, 11.52], 'Dano': [11.15, -3.07],
        'Hilton Head': [32.22, -80.75], 'Haifa': [32.79, 34.99],
        'Nuku\'alofa': [-21.21, -175.20], 'Bogot\u00e1': [4.71, -74.07],
        'S\u00e3o Paulo': [-23.55, -46.63]
    };

    // =========================================================================
    // GEOCODE — resolve lat/lon from country/alt_location
    // =========================================================================
    function geocodeCreator(creator) {
        var lat = parseFloat(creator.latitude) || 0;
        var lon = parseFloat(creator.longitude) || 0;
        if (lat !== 0 || lon !== 0) return { lat: lat, lon: lon };

        var altLoc = creator.alt_location || '';
        if (altLoc) {
            var altParts = altLoc.split(',');
            for (var i = 0; i < altParts.length; i++) {
                var cityName = altParts[i].trim();
                if (CITY_COORDS[cityName]) return { lat: CITY_COORDS[cityName][0], lon: CITY_COORDS[cityName][1] };
            }
        }

        var country = (creator.country || '').split(',')[0].trim().replace(/\s*\(.*\)/, '').trim();
        if (COUNTRY_COORDS[country]) return { lat: COUNTRY_COORDS[country][0], lon: COUNTRY_COORDS[country][1] };

        var words = (creator.country || '').split(/[,\s]+/);
        for (var j = 0; j < words.length; j++) {
            var w = words[j].trim();
            if (w && COUNTRY_COORDS[w]) return { lat: COUNTRY_COORDS[w][0], lon: COUNTRY_COORDS[w][1] };
        }

        return { lat: (Math.random() - 0.5) * 60, lon: (Math.random() - 0.5) * 300 };
    }

    // =========================================================================
    // OVERLAP RESOLUTION — Change 4: tighter clustering
    // =========================================================================
    function resolveOverlaps(people, thresholdDeg) {
        thresholdDeg = thresholdDeg || 3;
        var assigned = new Array(people.length).fill(false);
        var clusters = [];

        for (var i = 0; i < people.length; i++) {
            if (assigned[i]) continue;
            var cluster = [i];
            assigned[i] = true;
            for (var j = i + 1; j < people.length; j++) {
                if (assigned[j]) continue;
                var dlat = people[i].lat - people[j].lat;
                var dlon = people[i].lon - people[j].lon;
                if (Math.sqrt(dlat * dlat + dlon * dlon) < thresholdDeg) {
                    cluster.push(j);
                    assigned[j] = true;
                }
            }
            clusters.push(cluster);
        }

        clusters.forEach(function(cluster) {
            if (cluster.length <= 1) {
                var p = people[cluster[0]];
                p.displayLat = p.lat;
                p.displayLon = p.lon;
                p.isOffset = false;
                return;
            }
            var cLat = 0, cLon = 0;
            cluster.forEach(function(idx) { cLat += people[idx].lat; cLon += people[idx].lon; });
            cLat /= cluster.length;
            cLon /= cluster.length;
            var spreadRadius = Math.min(12, 2.0 + cluster.length * 0.5);
            cluster.forEach(function(idx, i) {
                var angle = (i / cluster.length) * 2 * PI;
                var jitter = (Math.random() - 0.5) * 0.15;
                var r = spreadRadius * (0.9 + Math.random() * 0.2);
                people[idx].displayLat = Math.max(-80, Math.min(80, cLat + Math.cos(angle + jitter) * r));
                people[idx].displayLon = cLon + Math.sin(angle + jitter) * r;
                people[idx].isOffset = true;
            });
        });
    }

    // =========================================================================
    // HELPER: roundedRect for canvas
    // =========================================================================
    function roundedRect(ctx, x, y, w, h, r) {
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
        }
    }

    // =========================================================================
    // HELPER: extract YouTube thumbnail
    // =========================================================================
    function extractYouTubeThumbnail(embedHtml) {
        var match = embedHtml.match(/(?:youtube\.com\/embed\/|youtu\.be\/)([^"?&]+)/);
        if (match && match[1]) return 'https://img.youtube.com/vi/' + match[1] + '/hqdefault.jpg';
        return '';
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================
    function CommunityGlobe() {
        this.config = { containerId: 'community-globe' };
        this.container = null;
        this.supabase = null;
        this.people = [];
        this.LAND = [];
        this.geoJsonData = null;
        this.scene = null; this.camera = null; this.renderer = null; this.controls = null;
        this.globeGroup = null; this.starGroup = null; this.starMat = null;
        this.morphTime = 0.0; this.morphDir = 0; this.is2DMode = false; this.isPreparing2D = false;
        this.morphMaterials = [];
        this.vectorMaterial = null; this.countryMaterial = null; this.graticuleMaterial = null;
        this.innerSphere = null; this.sphereFillMesh = null; this.planeFillMesh = null;
        this._shadowMat = null; this._innerSphereMat = null;
        this.markersList = []; this.arcLines = []; this.connectionLines = [];
        this.hoveringMarker = false; this.activePersonIndex = -1; this.hideTimeout = null;
        this.profileMaterials = []; this.profileDimTargets = [];
        this.profileCard = null; this.coordsEl = null; this.infoCountEl = null;
        this.animating = false;
        this._saved3DPosition = null; this._saved3DTarget = null;
        this._flatCameraPosition = null; this._flatCameraTarget = null;
        this.activeFilters = new Set();
        this.categoryCounts = {};
        // Change 6: pinned card
        this.pinnedCard = null;
        this.pinnedPersonIndex = -1;
        // Change 7: player modal
        this.playerModal = null;
        this.playerExpanded = false;
        // Change 9: image toggle (default to 'work')
        this.imageMode = 'work';
        // Phase 2.2 additions
        this.leftPanel = null;
        this.lightbox = null;
        this.nominateModal = null;
        this.baseCardSize = R * 0.08;
        // Phase 2.3 additions
        // embed fade handled by per-click timeout (auto-unfade after 2s)
        this._currentPlayerPerson = null;
        this.currentView = 'globe';
        this.galleryContainer = null;
        this._connectionObjects = {}; // personIndex → [line, dot] for filter-based hiding
        // Phase 3 additions
        this._hoverShowTimeout = null;
        this._pendingHoverIdx = -1;
        this._hoverRaiseIdx = -1;
        this._oceanLines = [];
        this._flatBgLines = [];
        this._oceanLineTime = 0;
        this._embedFadeTimeout = null;
        this.stayConnectedModal = null;
        this.welcomeModal = null;
    }

    // =========================================================================
    // INIT
    // =========================================================================
    CommunityGlobe.prototype.init = async function(options) {
        console.log('[awakening-earth-v3.1] Initializing...');
        Object.assign(this.config, options || {});
        this.container = document.getElementById(this.config.containerId);
        if (!this.container) return;
        this.container.classList.add('cg-wrapper');
        this.LAND = window.LAND_DATA || [];

        try {
            this.initSupabase();
            await Promise.all([this.fetchData(), this.fetchGeoJSON()]);
            this.buildDOM();
            this.initScene();
            this.buildStars();
            this.buildGlobe();
            this.buildProfileMarkers();
            this.bindEvents();
            this.animate();
            var loading = this.container.querySelector('.cg-loading');
            if (loading) {
                setTimeout(function() {
                    loading.classList.add('fade-out');
                    setTimeout(function() { loading.remove(); }, 1000);
                }, 400);
            }
            // Show welcome modal for first-time visitors (after globe is visible)
            var welcomeSelf = this;
            setTimeout(function() { welcomeSelf._showWelcomeIfFirstVisit(); }, 800);
        } catch (err) {
            console.error('[awakening-earth-v3.1] Init error:', err);
            this.container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:400px;color:#999;">Error loading globe. Please refresh.</div>';
        }
    };

    CommunityGlobe.prototype.initSupabase = function() {
        if (window.MembershipCore && window.MembershipCore.supabaseClient) {
            this.supabase = window.MembershipCore.supabaseClient;
        } else {
            throw new Error('MembershipCore Supabase client not available');
        }
    };

    CommunityGlobe.prototype.fetchGeoJSON = async function() {
        try {
            var response = await fetch(GEOJSON_URL);
            this.geoJsonData = await response.json();
            console.log('[awakening-earth-v3.1] GeoJSON loaded:', this.geoJsonData.features.length, 'features');
        } catch (err) {
            console.warn('[awakening-earth-v3.1] GeoJSON fetch failed:', err);
            this.geoJsonData = null;
        }
    };

    // =========================================================================
    // DATA FETCHING — creators table
    // =========================================================================
    CommunityGlobe.prototype.fetchData = async function() {
        console.log('[awakening-earth-v3.1] Fetching creators...');
        var sb = this.supabase;
        var fields = 'id, name, description, profile_full_url, profile_thumb_url, example_image_url, example_thumb_url, example_embed, category, tags, medium, latitude, longitude, country, city_region, alt_location, your_picks, link, why_collective_awakening, status, millennial';

        var res = await sb.from('creators').select(fields)
            .eq('your_picks', true).eq('status', 'Published');
        if (res.error) console.warn('[awakening-earth-v3.1] Query error:', res.error.message);
        var creators = (res.data || []);

        if (creators.length === 0) {
            console.log('[awakening-earth-v3.1] No Published creators. Falling back to your_picks only...');
            res = await sb.from('creators').select(fields).eq('your_picks', true);
            if (res.error) console.warn('[awakening-earth-v3.1] Fallback query error:', res.error.message);
            creators = (res.data || []);
        }

        console.log('[awakening-earth-v3.1] Fetched', creators.length, 'creators');
        this.categoryCounts = {};
        var self = this;

        this.people = creators.map(function(c) {
            var coords = geocodeCreator(c);
            var categories = c.category || [];
            var primaryColor = CATEGORY_COLORS[categories[0]] || '#999';
            categories.forEach(function(cat) { self.categoryCounts[cat] = (self.categoryCounts[cat] || 0) + 1; });

            return {
                id: c.id, lat: coords.lat, lon: coords.lon,
                originalLat: coords.lat, originalLon: coords.lon,
                displayLat: coords.lat, displayLon: coords.lon, isOffset: false,
                name: c.name || 'Unknown',
                imageUrl: c.profile_full_url || '',
                imageThumb: c.profile_thumb_url || c.profile_full_url || '',
                exampleImageUrl: c.example_image_url || '',
                exampleThumb: c.example_thumb_url || c.example_image_url || '',
                exampleEmbed: c.example_embed || '',
                description: c.description || '',
                whyCollectiveAwakening: c.why_collective_awakening || '',
                categories: categories, tags: c.tags || [], medium: c.medium || [],
                location: c.alt_location || c.country || '',
                country: c.country || '', cityRegion: c.city_region || '', altLocation: c.alt_location || '',
                link: c.link || '', millennial: c.millennial || false,
                primaryColor: primaryColor, visible: true,
                altitudeFactor: 0.75 + Math.random() * 0.5 // range [0.75, 1.25] for altitude variation
            };
        });

        resolveOverlaps(this.people, 5);
        this.profileDimTargets = this.people.map(function() { return 1.0; });
        console.log('[awakening-earth-v3.1] Processed', this.people.length, 'creators with geocoding');
    };

    // =========================================================================
    // DOM — UI with all card types, filters, player modal
    // =========================================================================
    CommunityGlobe.prototype.buildDOM = function() {
        this.container.innerHTML = '';
        var self = this;

        var loading = document.createElement('div');
        loading.className = 'cg-loading';
        loading.innerHTML = '<div class="cg-loading-text">Generating Globe</div>';
        this.container.appendChild(loading);

        // ---- Hover card (CHANGE 1: simplified with header row) ----
        this.profileCard = document.createElement('div');
        this.profileCard.className = 'cg-card';
        this.profileCard.innerHTML =
            '<div class="cg-card-inner">' +
              '<div class="pc-accent" id="cg-accent"></div>' +
              '<div class="pc-body">' +
                '<div class="pc-header-row">' +
                  '<img class="pc-thumb" id="cg-thumb" src="" alt="">' +
                  '<div class="pc-header-info">' +
                    '<div class="pc-name" id="cg-name"></div>' +
                    '<div class="pc-categories" id="cg-categories"></div>' +
                    '<div class="pc-location" id="cg-location"></div>' +
                  '</div>' +
                '</div>' +
                '<div class="pc-example" id="cg-example">' +
                  '<img class="pc-example-img" id="cg-example-img" src="" alt="">' +
                  '<div class="pc-example-embed" id="cg-example-embed"></div>' +
                '</div>' +
                '<div class="pc-description" id="cg-description"></div>' +
                '<button class="pc-see-more" id="cg-see-more">See More \u2192</button>' +
              '</div>' +
            '</div>';
        this.container.appendChild(this.profileCard);

        this.profileCard.addEventListener('mouseenter', function() {
            if (self.hideTimeout) { clearTimeout(self.hideTimeout); self.hideTimeout = null; }
        });
        this.profileCard.addEventListener('mouseleave', function() { self.hideProfileCard(); });

        // FIX 4: clicking hover card body opens pinned card
        var cardInner = this.profileCard.querySelector('.cg-card-inner');
        if (cardInner) {
            cardInner.addEventListener('click', function(e) {
                // Don't trigger if clicking links, buttons, or embed overlays
                if (e.target.closest('a') || e.target.closest('.pc-embed-overlay')) return;
                if (self.activePersonIndex >= 0) self.pinProfileCard(self.activePersonIndex);
            });
        }

        // "See More" button handler
        var seeMoreBtn = this.profileCard.querySelector('#cg-see-more');
        if (seeMoreBtn) {
            seeMoreBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (self.activePersonIndex >= 0) self.pinProfileCard(self.activePersonIndex);
            });
        }

        // ---- Pinned card ----
        this.pinnedCard = document.createElement('div');
        this.pinnedCard.className = 'cg-pinned-card';
        this.pinnedCard.innerHTML =
            '<div class="cg-pinned-inner">' +
              '<button class="cg-pinned-close" title="Close">\u00d7</button>' +
              '<div class="pc-accent" id="pin-accent"></div>' +
              '<div class="pc-image-wrap" id="pin-image-wrap">' +
                '<img class="pc-image" id="pin-image" src="" alt="">' +
              '</div>' +
              '<div class="pc-body">' +
                '<div class="pc-name" id="pin-name"></div>' +
                '<div class="pc-categories" id="pin-categories"></div>' +
                '<div class="pc-location" id="pin-location"></div>' +
                '<div class="pc-example" id="pin-example">' +
                  '<img class="pc-example-img" id="pin-example-img" src="" alt="">' +
                  '<div class="pc-example-embed" id="pin-example-embed"></div>' +
                '</div>' +
                '<div class="pc-description" id="pin-description"></div>' +
                '<div class="pc-awakening" id="pin-awakening"></div>' +
                '<div class="pc-tags-wrap">' +
                  '<div class="pc-tags" id="pin-tags"></div>' +
                  '<div class="pc-medium" id="pin-medium"></div>' +
                '</div>' +
                '<a class="pc-link" id="pin-link" href="#" target="_blank">Explore Further \u2192</a>' +
              '</div>' +
            '</div>';
        this.container.appendChild(this.pinnedCard);

        var pinnedClose = this.pinnedCard.querySelector('.cg-pinned-close');
        if (pinnedClose) {
            pinnedClose.addEventListener('click', function() {
                self.pinnedCard.classList.remove('visible');
                self.pinnedPersonIndex = -1;
            });
        }

        // ---- Player modal ----
        this.playerModal = document.createElement('div');
        this.playerModal.className = 'cg-player-modal';
        this.playerModal.innerHTML =
            '<div class="cg-player-inner">' +
              '<div class="cg-player-controls">' +
                '<button class="cg-player-expand" title="Expand">\u2922</button>' +
                '<button class="cg-player-close" title="Close">\u00d7</button>' +
              '</div>' +
              '<div class="cg-player-content" id="cg-player-content"></div>' +
              '<div class="cg-player-label" id="cg-player-label"></div>' +
            '</div>';
        this.container.appendChild(this.playerModal);

        var playerExpandBtn = this.playerModal.querySelector('.cg-player-expand');
        var playerCloseBtn = this.playerModal.querySelector('.cg-player-close');
        if (playerExpandBtn) {
            playerExpandBtn.addEventListener('click', function() {
                self.playerModal.classList.toggle('expanded');
                self.playerExpanded = self.playerModal.classList.contains('expanded');
            });
        }
        if (playerCloseBtn) {
            playerCloseBtn.addEventListener('click', function() {
                self.playerModal.classList.remove('visible');
                self.playerModal.classList.remove('expanded');
                self.playerModal.classList.remove('video-player');
                self.playerExpanded = false;
                var content = self.playerModal.querySelector('#cg-player-content');
                if (content) content.innerHTML = '';
            });
        }

        // ---- Lightbox (CHANGE 3) ----
        this.lightbox = document.createElement('div');
        this.lightbox.className = 'cg-lightbox';
        this.lightbox.innerHTML = '<img class="cg-lightbox-img" src="" alt="">';
        this.lightbox.addEventListener('click', function(e) {
            if (!e.target.classList.contains('cg-lightbox-img')) {
                self.closeLightbox();
            }
        });
        this.container.appendChild(this.lightbox);

        // ---- FIX 1: Left panel wrapper (info + filter + toggle) ----
        this.leftPanel = document.createElement('div');
        this.leftPanel.className = 'cg-left-panel';

        // Info panel
        var info = document.createElement('div');
        info.className = 'cg-info';
        info.innerHTML = '<h1>Our Awakening Earth</h1>' +
            '<p class="cg-subtitle">A living map of creators, thinkers, and communities catalyzing collective awakening across the globe.</p>' +
            '<p id="cg-count">' + this.people.length + ' Creators</p>';
        this.leftPanel.appendChild(info);
        this.infoCountEl = info.querySelector('#cg-count');

        // Filter bar (appended to leftPanel inside buildFilterBar)
        this.buildFilterBar();

        // Image toggle
        var imageToggle = document.createElement('div');
        imageToggle.className = 'cg-image-toggle';
        imageToggle.innerHTML =
            '<button class="cg-img-toggle-btn" data-mode="profile">Profile</button>' +
            '<button class="cg-img-toggle-btn active" data-mode="work">Work</button>';
        imageToggle.addEventListener('click', function(e) {
            var btn = e.target.closest('.cg-img-toggle-btn');
            if (!btn) return;
            var mode = btn.dataset.mode;
            if (mode === self.imageMode) return;
            self.imageMode = mode;
            imageToggle.querySelectorAll('.cg-img-toggle-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.mode === mode);
            });
            self.refreshMarkerImages();
        });
        this.leftPanel.appendChild(imageToggle);

        this.container.appendChild(this.leftPanel);

        // Coordinates
        this.coordsEl = document.createElement('div');
        this.coordsEl.className = 'cg-coords';
        this.coordsEl.textContent = 'LAT 0.00\u00b0 \u00b7 LON 0.00\u00b0';
        this.container.appendChild(this.coordsEl);

        // Controls hint
        var controls = document.createElement('div');
        controls.className = 'cg-controls';
        controls.innerHTML = 'Drag to rotate \u00b7 Scroll to zoom<br>Hover for details \u00b7 Click to explore';
        this.container.appendChild(controls);

        // View tabs — Globe | Flat | Gallery
        var viewTabs = document.createElement('div');
        viewTabs.className = 'cg-view-tabs';
        viewTabs.innerHTML =
            '<button class="cg-view-tab active" data-view="globe">Globe</button>' +
            '<button class="cg-view-tab" data-view="flat">Flat</button>' +
            '<button class="cg-view-tab" data-view="gallery">Gallery</button>';
        viewTabs.addEventListener('click', function(e) {
            var btn = e.target.closest('.cg-view-tab');
            if (!btn) return;
            self.switchView(btn.dataset.view);
        });
        this.container.appendChild(viewTabs);

        // Gallery container (hidden by default)
        this.galleryContainer = document.createElement('div');
        this.galleryContainer.className = 'cg-gallery-container';
        this.container.appendChild(this.galleryContainer);

        // ---- Action buttons wrapper (Nominate + Stay Connected) ----
        var actionBtns = document.createElement('div');
        actionBtns.className = 'cg-action-buttons';

        var nominateBtn = document.createElement('button');
        nominateBtn.className = 'cg-nominate-btn';
        nominateBtn.innerHTML = '\u2726 Nominate a Creator';
        nominateBtn.addEventListener('click', function() {
            self.nominateModal.classList.add('visible');
        });
        actionBtns.appendChild(nominateBtn);

        var stayConnBtn = document.createElement('button');
        stayConnBtn.className = 'cg-stay-connected-btn';
        stayConnBtn.innerHTML = '\u2665 Stay Connected';
        stayConnBtn.addEventListener('click', function() {
            self.stayConnectedModal.classList.add('visible');
        });
        actionBtns.appendChild(stayConnBtn);

        this.container.appendChild(actionBtns);

        this.nominateModal = document.createElement('div');
        this.nominateModal.className = 'cg-nominate-modal';

        var catCheckboxes = CATEGORY_LIST.map(function(cat) {
            var color = CATEGORY_COLORS[cat] || '#999';
            return '<label class="cg-form-cat-label" style="color:' + color + ';border-color:' + color + '40">' +
                '<input type="checkbox" value="' + cat + '">' +
                '<span class="cg-filter-dot" style="background:' + color + '"></span>' + cat +
            '</label>';
        }).join('');

        this.nominateModal.innerHTML =
            '<div class="cg-nominate-form">' +
              '<h2>\u2726 Nominate a Creator</h2>' +
              '<p class="cg-form-subtitle">Know someone catalyzing collective awakening? Nominate them to be featured on the globe. Submissions will be reviewed before publishing.</p>' +
              '<div class="cg-form-group"><label>Your Name *</label><input type="text" id="nom-your-name" required placeholder="Your full name"></div>' +
              '<div class="cg-form-group"><label>Your Email *</label><input type="email" id="nom-email" required placeholder="you@example.com"></div>' +
              '<hr class="cg-form-divider">' +
              '<div class="cg-form-group"><label>Creator\'s Name *</label><input type="text" id="nom-name" required placeholder="Full name of the creator"></div>' +
              '<div class="cg-form-group"><label>Profile Image URL</label><input type="text" id="nom-image" placeholder="https://..."></div>' +
              '<div class="cg-form-group"><label>Category</label><div class="cg-form-cats">' + catCheckboxes + '</div></div>' +
              '<div class="cg-form-group"><label>Description</label><textarea id="nom-description" placeholder="Brief description of their work..."></textarea></div>' +
              '<div class="cg-form-group"><label>Link</label><input type="text" id="nom-link" placeholder="Website or social link"></div>' +
              '<div class="cg-form-group"><label>Why Collective Awakening?</label><textarea id="nom-reasoning" placeholder="Why should they be featured?"></textarea></div>' +
              '<div class="cg-form-group"><label>Location</label><input type="text" id="nom-location" placeholder="City, Country"></div>' +
              '<label class="cg-form-checkbox"><input type="checkbox" id="nom-consent"><span>I agree to receive occasional updates about this project</span></label>' +
              '<div class="cg-form-actions">' +
                '<button class="cg-form-cancel" type="button">Cancel</button>' +
                '<button class="cg-form-submit" type="button">Submit Nomination</button>' +
              '</div>' +
              '<div class="cg-form-status" id="nom-status"></div>' +
            '</div>';
        this.container.appendChild(this.nominateModal);

        // Nomination form event handlers
        this.nominateModal.querySelector('.cg-form-cancel').addEventListener('click', function() {
            self.nominateModal.classList.remove('visible');
        });
        this.nominateModal.addEventListener('click', function(e) {
            if (e.target === self.nominateModal) self.nominateModal.classList.remove('visible');
        });

        // Category checkbox toggle styling
        this.nominateModal.querySelectorAll('.cg-form-cat-label input').forEach(function(cb) {
            cb.addEventListener('change', function() {
                cb.parentElement.classList.toggle('checked', cb.checked);
            });
        });

        // Submit handler
        this.nominateModal.querySelector('.cg-form-submit').addEventListener('click', function() {
            self.submitNomination();
        });

        // ---- Stay Connected modal ----
        this.stayConnectedModal = document.createElement('div');
        this.stayConnectedModal.className = 'cg-nominate-modal'; // reuse modal overlay styles
        this.stayConnectedModal.innerHTML =
            '<div class="cg-nominate-form">' +
              '<h2>\u2665 Stay Connected</h2>' +
              '<p class="cg-form-subtitle">Join our community and stay updated on the Awakening Earth project. We\'d love to hear from you!</p>' +
              '<div class="cg-form-group"><label>Name *</label><input type="text" id="sc-name" required placeholder="Your full name"></div>' +
              '<div class="cg-form-group"><label>Email *</label><input type="email" id="sc-email" required placeholder="you@example.com"></div>' +
              '<div class="cg-form-group"><label>Location</label><input type="text" id="sc-location" placeholder="City, Country"></div>' +
              '<div class="cg-form-group"><label>Note</label><textarea id="sc-note" placeholder="Share a note with the admins..."></textarea></div>' +
              '<label class="cg-form-checkbox"><input type="checkbox" id="sc-consent"><span>I agree to receive occasional updates about this project</span></label>' +
              '<div class="cg-form-actions">' +
                '<button class="cg-form-cancel" type="button">Cancel</button>' +
                '<button class="cg-form-submit" type="button">Submit</button>' +
              '</div>' +
              '<div class="cg-form-status" id="sc-status"></div>' +
            '</div>';
        this.container.appendChild(this.stayConnectedModal);

        // Stay Connected event handlers
        this.stayConnectedModal.querySelector('.cg-form-cancel').addEventListener('click', function() {
            self.stayConnectedModal.classList.remove('visible');
        });
        this.stayConnectedModal.addEventListener('click', function(e) {
            if (e.target === self.stayConnectedModal) self.stayConnectedModal.classList.remove('visible');
        });
        this.stayConnectedModal.querySelector('.cg-form-submit').addEventListener('click', function() {
            self.submitStayConnected();
        });

        // ---- Welcome Modal ----
        this._buildWelcomeModal();

        // ---- Credit Attribution ----
        this._buildCredit();
    };

    // =========================================================================
    // WELCOME MODAL — first-visit onboarding
    // =========================================================================
    CommunityGlobe.prototype._buildWelcomeModal = function() {
        var self = this;
        this.welcomeModal = document.createElement('div');
        this.welcomeModal.className = 'cg-welcome-modal';
        this.welcomeModal.innerHTML =
            '<div class="cg-welcome-inner">' +
              '<h2>Welcome to Our Awakening Earth</h2>' +
              '<p class="cg-welcome-intro">Explore a growing community of creators, artists, musicians, and visionaries contributing to our collective awakening. Here\'s how to navigate:</p>' +
              '<div class="cg-welcome-sections">' +
                '<div class="cg-welcome-item">' +
                  '<div class="cg-welcome-icon">\uD83C\uDF0D</div>' +
                  '<div class="cg-welcome-item-text"><strong>Viewing Modes</strong><span>Switch between Globe, Flat Map, and Gallery views using the tabs in the top right corner.</span></div>' +
                '</div>' +
                '<div class="cg-welcome-item">' +
                  '<div class="cg-welcome-icon">\uD83C\uDFA8</div>' +
                  '<div class="cg-welcome-item-text"><strong>Category Filters</strong><span>Filter creators by discipline \u2014 Visual Artists, Musicians, Authors, Community builders, and more \u2014 using the filter bar on the left.</span></div>' +
                '</div>' +
                '<div class="cg-welcome-item">' +
                  '<div class="cg-welcome-icon">\uD83D\uDDBC\uFE0F</div>' +
                  '<div class="cg-welcome-item-text"><strong>Profile / Work Toggle</strong><span>Switch the card images between profile photos and creative work samples to explore each creator\'s art.</span></div>' +
                '</div>' +
                '<div class="cg-welcome-item">' +
                  '<div class="cg-welcome-icon">\u2726</div>' +
                  '<div class="cg-welcome-item-text"><strong>Nominate a Creator</strong><span>Know an inspiring creator? Use the Nominate button to suggest them for the community.</span></div>' +
                '</div>' +
              '</div>' +
              '<button class="cg-welcome-start">Start Exploring</button>' +
            '</div>';
        this.container.appendChild(this.welcomeModal);

        // Close handlers
        this.welcomeModal.querySelector('.cg-welcome-start').addEventListener('click', function() {
            self._closeWelcome();
        });
        this.welcomeModal.addEventListener('click', function(e) {
            if (e.target === self.welcomeModal) self._closeWelcome();
        });
    };

    CommunityGlobe.prototype._closeWelcome = function() {
        this.welcomeModal.classList.remove('visible');
        try { localStorage.setItem('cg-welcome-shown', '1'); } catch(e) {}
    };

    CommunityGlobe.prototype._showWelcomeIfFirstVisit = function() {
        try {
            if (!localStorage.getItem('cg-welcome-shown')) {
                this.welcomeModal.classList.add('visible');
            }
        } catch(e) {
            // localStorage unavailable — show anyway
            this.welcomeModal.classList.add('visible');
        }
    };

    // =========================================================================
    // CREDIT ATTRIBUTION
    // =========================================================================
    CommunityGlobe.prototype._buildCredit = function() {
        var credit = document.createElement('div');
        credit.className = 'cg-credit';
        credit.innerHTML = 'Concept and implementation by <a href="/about-james">James Bolden</a>';
        this.container.appendChild(credit);
    }

    // =========================================================================
    // FILTER BAR — Change 10: simplified to 5 groups
    // =========================================================================
    CommunityGlobe.prototype.buildFilterBar = function() {
        var self = this;
        var bar = document.createElement('div');
        bar.className = 'cg-filter-bar';

        var allBtn = document.createElement('button');
        allBtn.className = 'cg-filter-btn cg-filter-all active';
        allBtn.textContent = 'See All';
        allBtn.addEventListener('click', function() { self.activeFilters.clear(); self.applyFilters(); });
        bar.appendChild(allBtn);

        var groupOrder = ['Visual Artist', 'Musician', 'Author', 'Community', 'Other'];
        groupOrder.forEach(function(groupName) {
            var cats = FILTER_GROUPS[groupName];
            if (!cats) return;
            // Count total creators in this group
            var count = 0;
            cats.forEach(function(cat) { count += (self.categoryCounts[cat] || 0); });
            if (count === 0) return;

            var color = groupName === 'Other' ? '#888' : (CATEGORY_COLORS[groupName] || '#888');
            var btn = document.createElement('button');
            btn.className = 'cg-filter-btn';
            btn.dataset.filterGroup = groupName;
            btn.innerHTML = '<span class="cg-filter-dot" style="background:' + color + '"></span>' + groupName;
            btn.addEventListener('click', function() {
                var groupCats = FILTER_GROUPS[groupName];
                var allActive = groupCats.every(function(c) { return self.activeFilters.has(c); });
                if (allActive) {
                    groupCats.forEach(function(c) { self.activeFilters.delete(c); });
                } else {
                    groupCats.forEach(function(c) { self.activeFilters.add(c); });
                }
                self.applyFilters();
            });
            bar.appendChild(btn);
        });

        // FIX 1: append to leftPanel instead of container
        this.leftPanel.appendChild(bar);
        this.filterBar = bar;
    };

    CommunityGlobe.prototype.applyFilters = function() {
        var hasFilter = this.activeFilters.size > 0;
        var visibleCount = 0;

        var allBtn = this.filterBar.querySelector('.cg-filter-all');
        if (allBtn) allBtn.classList.toggle('active', !hasFilter);

        var self = this;
        this.filterBar.querySelectorAll('.cg-filter-btn[data-filter-group]').forEach(function(btn) {
            var groupName = btn.dataset.filterGroup;
            var groupCats = FILTER_GROUPS[groupName] || [];
            var anyActive = groupCats.some(function(c) { return self.activeFilters.has(c); });
            btn.classList.toggle('active', anyActive);
        });

        this.people.forEach(function(person, idx) {
            if (!hasFilter) {
                person.visible = true;
            } else {
                person.visible = person.categories.some(function(cat) { return self.activeFilters.has(cat); });
            }
            self.profileDimTargets[idx] = person.visible ? 1.0 : 0.0;
            if (person.visible) visibleCount++;

            // Hide hitbox for non-visible cards so they don't intercept hover/click
            if (self.markersList && self.markersList[idx]) {
                self.markersList[idx].hitbox.visible = person.visible;
            }

            // Hide connection lines and dots for non-visible cards
            if (self._connectionObjects && self._connectionObjects[idx]) {
                self._connectionObjects[idx].forEach(function(obj) { obj.visible = person.visible; });
            }
        });

        if (this.infoCountEl) {
            this.infoCountEl.textContent = (hasFilter ? visibleCount + ' of ' : '') + this.people.length + ' Creators';
        }

        // Rebuild gallery cards if in gallery view
        if (this.currentView === 'gallery') this.buildGalleryCards();
    };

    // =========================================================================
    // THREE.JS SCENE
    // =========================================================================
    CommunityGlobe.prototype.initScene = function() {
        var w = this.container.clientWidth;
        var h = this.container.clientHeight || (this.container.parentElement && this.container.parentElement.clientHeight) || window.innerHeight;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
        this.camera.position.set(0, 2, 18);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.enablePan = false;
        this.controls.minDistance = 8;
        this.controls.maxDistance = 40;
        this.controls.rotateSpeed = 0.5;
        this.controls.zoomSpeed = 0.8;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.3;

        this.globeGroup = new THREE.Group();
        this.scene.add(this.globeGroup);
    };

    // =========================================================================
    // COORDINATE HELPERS
    // =========================================================================
    function latLonToVec3(lat, lon, r) {
        var phi = (90 - lat) * PI / 180;
        var theta = (lon + 180) * PI / 180;
        return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }

    function latLonToFlat(lat, lon, r) {
        return new THREE.Vector3((lon / 180) * PI * r, (lat / 90) * (PI / 2) * r, 0);
    }

    // =========================================================================
    // MORPHABLE SHADER MATERIAL
    // =========================================================================
    CommunityGlobe.prototype.createMorphShaderMaterial = function(maxOpacity, color) {
        var mat = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(color || 0x40c0d0) },
                morphT: { value: 0.0 }, maxOpacity: { value: maxOpacity }, uDimFactor: { value: 1.0 }
            },
            vertexShader: [
                'attribute vec3 pos2D;', 'uniform float morphT;', 'uniform float maxOpacity;', 'varying float vAlpha;',
                'void main() {',
                '    vec3 currentPos = mix(position, pos2D, morphT);',
                '    vec3 normal3D = normalize(position);', '    vec3 normal2D = vec3(0.0, 0.0, 1.0);',
                '    vec3 currentNormal = normalize(mix(normal3D, normal2D, morphT));',
                '    vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0);',
                '    vec3 viewDir = normalize(-mvPosition.xyz);',
                '    vec3 nMatrix = normalize(normalMatrix * currentNormal);',
                '    float facing = dot(nMatrix, viewDir);',
                '    float baseAlpha = smoothstep(-0.2, 0.2, facing);',
                '    float backOpacity = maxOpacity * 0.25;',
                '    vAlpha = mix(mix(backOpacity, maxOpacity, baseAlpha), maxOpacity, morphT);',
                '    gl_Position = projectionMatrix * mvPosition;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 color;', 'uniform float uDimFactor;', 'varying float vAlpha;',
                'void main() { gl_FragColor = vec4(color, vAlpha * uDimFactor); }'
            ].join('\n'),
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        });
        this.morphMaterials.push(mat);
        return mat;
    };

    CommunityGlobe.prototype.createMorphableLine = function(latLons, material) {
        var positions = new Float32Array(latLons.length * 3);
        var pos2Ds = new Float32Array(latLons.length * 3);
        latLons.forEach(function(ll, i) {
            var v3 = latLonToVec3(ll.lat, ll.lon, R);
            var v2 = latLonToFlat(ll.lat, ll.lon, R);
            positions[i * 3] = v3.x; positions[i * 3 + 1] = v3.y; positions[i * 3 + 2] = v3.z;
            pos2Ds[i * 3] = v2.x; pos2Ds[i * 3 + 1] = v2.y; pos2Ds[i * 3 + 2] = v2.z;
        });
        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('pos2D', new THREE.BufferAttribute(pos2Ds, 3));
        var line = new THREE.Line(geometry, material);
        line.renderOrder = 4; // render after continent fills (3) to be visible on top
        this.globeGroup.add(line);
        return line;
    };

    CommunityGlobe.prototype.createConnectionLineMaterial = function(color, opacity) {
        var mat = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(color) },
                morphT: { value: 0.0 }, maxOpacity: { value: opacity || 1.0 }, uDimFactor: { value: 1.0 },
                uCamPos: { value: new THREE.Vector3(0, 0, 15) }
            },
            vertexShader: [
                'attribute vec3 pos2D;', 'uniform float morphT;', 'uniform float maxOpacity;',
                'uniform vec3 uCamPos;',
                'varying float vAlpha;',
                'void main() {',
                '    vec3 currentPos = mix(position, pos2D, morphT);',
                '    // In globe mode, hide lines on back/horizon of globe',
                '    if (morphT < 0.5) {',
                '        vec3 n = normalize(position);',
                '        vec3 v = normalize(uCamPos - position);',
                '        float facing = dot(n, v);',
                '        float visFade = smoothstep(-0.05, 0.25, facing);',
                '        vAlpha = maxOpacity * visFade;',
                '    } else {',
                '        vAlpha = maxOpacity;',
                '    }',
                '    gl_Position = projectionMatrix * modelViewMatrix * vec4(currentPos, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 color;', 'uniform float uDimFactor;', 'varying float vAlpha;',
                'void main() {',
                '    if (vAlpha < 0.01) discard;',
                '    gl_FragColor = vec4(color, vAlpha * uDimFactor);',
                '}'
            ].join('\n'),
            transparent: true, blending: THREE.NormalBlending, depthWrite: false
        });
        this.morphMaterials.push(mat);
        return mat;
    };

    // =========================================================================
    // STARS
    // =========================================================================
    CommunityGlobe.prototype.buildStars = function() {
        this.starGroup = new THREE.Group();
        this.scene.add(this.starGroup);
        var count = 500;
        var pos = new Float32Array(count * 3);
        var sizes = new Float32Array(count);
        for (var i = 0; i < count; i++) {
            var theta = Math.random() * PI * 2;
            var phi = Math.acos(2 * Math.random() - 1);
            var r = 60 + Math.random() * 30;
            pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            pos[i * 3 + 2] = r * Math.cos(phi);
            sizes[i] = 0.5 + Math.random() * 1.5;
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        this.starMat = new THREE.ShaderMaterial({
            uniforms: {
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uGlobeCenter: { value: new THREE.Vector3(0, 0, 0) },
                uGlobeRadius: { value: R * 1.02 }, uFade: { value: 1.0 }
            },
            vertexShader: [
                'attribute float size;', 'uniform float uPixelRatio;', 'uniform vec3 uGlobeCenter;',
                'uniform float uGlobeRadius;', 'uniform float uFade;',
                'varying float vBrightness;', 'varying float vOcclusion;',
                'void main() {',
                '    vec4 worldPos = modelMatrix * vec4(position, 1.0);',
                '    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);',
                '    gl_PointSize = size * uPixelRatio * (200.0 / -mvPos.z);',
                '    gl_Position = projectionMatrix * mvPos;',
                '    vBrightness = 0.3 + 0.7 * (size / 2.0);',
                '    vec3 rayDir = normalize(worldPos.xyz - cameraPosition);',
                '    vec3 oc = cameraPosition - uGlobeCenter;',
                '    float b = dot(oc, rayDir);',
                '    float c = dot(oc, oc) - uGlobeRadius * uGlobeRadius;',
                '    float disc = b * b - c;',
                '    if (disc > 0.0) {',
                '        float t = -b - sqrt(disc);',
                '        float starDist = length(worldPos.xyz - cameraPosition);',
                '        vOcclusion = (t > 0.0 && t < starDist) ? 0.08 : 1.0;',
                '    } else { vOcclusion = 1.0; }',
                '    vOcclusion *= uFade;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying float vBrightness;', 'varying float vOcclusion;',
                'void main() {',
                '    float d = length(gl_PointCoord - 0.5) * 2.0;',
                '    float alpha = smoothstep(1.0, 0.3, d) * vBrightness * 0.4 * vOcclusion;',
                '    gl_FragColor = vec4(0.2, 0.3, 0.4, alpha);',
                '}'
            ].join('\n'),
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.starGroup.add(new THREE.Points(geo, this.starMat));
    };

    // =========================================================================
    // GLOBE BUILD
    // =========================================================================
    CommunityGlobe.prototype.buildGlobe = function() {
        var self = this;
        var gg = this.globeGroup;

        var innerGeo = new THREE.SphereGeometry(R - 0.03, 64, 64);
        this._innerSphereMat = new THREE.ShaderMaterial({
            uniforms: { uOpacity: { value: 0.35 } },
            vertexShader: [
                'varying vec3 vNormal;', 'varying vec3 vViewPosition;',
                'void main() {',
                '    vNormal = normalize(normalMatrix * normal);',
                '    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);',
                '    vViewPosition = -mvPos.xyz;',
                '    gl_Position = projectionMatrix * mvPos;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform float uOpacity;', 'varying vec3 vNormal;', 'varying vec3 vViewPosition;',
                'void main() {',
                '    vec3 viewDir = normalize(vViewPosition);',
                '    float fresnel = 1.0 - max(0.0, dot(vNormal, viewDir));',
                '    float shade = 1.0 - fresnel * fresnel * 0.05;',
                '    vec3 color = mix(vec3(1.0), vec3(0.93, 0.93, 0.94), fresnel * fresnel);',
                '    gl_FragColor = vec4(color * shade, uOpacity);',
                '}'
            ].join('\n'),
            transparent: true, depthWrite: false
        });
        this.innerSphere = new THREE.Mesh(innerGeo, this._innerSphereMat);
        gg.add(this.innerSphere);

        this._buildDropShadow();
        this._buildContinentFills();

        this.vectorMaterial = this.createMorphShaderMaterial(0.3, 0x000000);
        this.countryMaterial = this.createMorphShaderMaterial(0.1, 0x333333);
        this.graticuleMaterial = this.createMorphShaderMaterial(0.08, 0x888888);
        this._buildGraticule();
        if (this.geoJsonData) this._buildGeoJSONVectors(this.geoJsonData);
        else this._buildLandDataVectors();

        var glowMat = new THREE.ShaderMaterial({
            uniforms: { glowColor: { value: new THREE.Color(0xffffff) }, viewVector: { value: this.camera.position }, morphT: { value: 0.0 } },
            vertexShader: [
                'uniform vec3 viewVector;', 'uniform float morphT;', 'varying float intensity;',
                'void main() {',
                '    vec3 vN = normalize(normalMatrix * normal);',
                '    vec3 vV = normalize(normalMatrix * viewVector);',
                '    intensity = pow(0.55 - dot(vN, vV), 3.0) * (1.0 - morphT);',
                '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 glowColor;', 'varying float intensity;',
                'void main() { gl_FragColor = vec4(glowColor * intensity, intensity * 0.15); }'
            ].join('\n'),
            side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
        });
        this._glowMat = glowMat;
        gg.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 64, 64), glowMat));
    };

    CommunityGlobe.prototype._buildDropShadow = function() {
        var c = document.createElement('canvas'); c.width = 512; c.height = 512;
        var ctx = c.getContext('2d');
        var g = ctx.createRadialGradient(256, 256, 0, 256, 256, 240);
        g.addColorStop(0, 'rgba(0,0,0,0.10)'); g.addColorStop(0.4, 'rgba(0,0,0,0.06)');
        g.addColorStop(0.7, 'rgba(0,0,0,0.02)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
        this._shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
        var sp = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.2, R * 3.2), this._shadowMat);
        sp.rotation.x = -PI / 2; sp.position.y = -R - 0.3;
        this._shadowMesh = sp; this.globeGroup.add(sp);
    };

    CommunityGlobe.prototype._buildContinentFills = function() {
        var canvas = document.createElement('canvas'); canvas.width = 4096; canvas.height = 2048;
        var ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
        var fillTex = new THREE.CanvasTexture(canvas); fillTex.minFilter = THREE.LinearFilter;
        this._continentTex = fillTex; // store ref for ocean line masking
        var self = this;
        var imageObj = new Image(); imageObj.crossOrigin = "Anonymous";
        imageObj.src = "./Iris_a_canvas_covered_in_paint_beautiful_abstract_art_thick_bru_9685ecde-4301-4db4-8f52-1df4ad378f65.png";
        imageObj.onload = function() {
            function mp(lon, lat) { return { x: (lon + 180) * (canvas.width / 360), y: (90 - lat) * (canvas.height / 180) }; }
            ctx.beginPath();
            if (self.geoJsonData) {
                self.geoJsonData.features.forEach(function(f) {
                    var pp = function(coords) { coords.forEach(function(ring) { ring.forEach(function(c, i) { var pt = mp(c[0], c[1]); if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); }); }); };
                    if (f.geometry.type === 'Polygon') pp(f.geometry.coordinates);
                    else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates.forEach(function(p) { pp(p); });
                });
            } else {
                self.LAND.forEach(function(polygon) { polygon.forEach(function(c, i) { var x = ((c[0] + 180) / 360) * canvas.width; var y = ((90 - c[1]) / 180) * canvas.height; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); });
            }
            ctx.closePath(); ctx.clip('evenodd');
            ctx.drawImage(imageObj, 0, 0, canvas.width, canvas.height);
            fillTex.needsUpdate = true;
        };
        var wU = { map: { value: fillTex }, morphT: { value: 0.0 }, uOpacity: { value: 1.0 } };
        var wV = ['uniform float morphT;', 'varying vec2 vUv;', 'const float PI = 3.14159265359;', 'const float R = ' + (R - 0.01).toFixed(4) + ';',
            'void main() { vUv = uv;',
            '    float lon = (position.x / (PI * R)) * 180.0;', '    float lat = (position.y / ((PI * R)/2.0)) * 90.0;',
            '    float phi = (90.0 - lat) * (PI / 180.0);', '    float theta = (lon + 180.0) * (PI / 180.0);',
            '    vec3 pos3D = vec3(-(R * sin(phi) * cos(theta)), R * cos(phi), R * sin(phi) * sin(theta));',
            '    vec3 pos2D = vec3(position.x, position.y, -0.2);',
            '    vec3 finalPos = mix(pos3D, pos2D, morphT);',
            '    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0); }'
        ].join('\n');
        var wF = ['uniform sampler2D map;', 'uniform float uOpacity;', 'varying vec2 vUv;',
            'void main() { vec4 color = texture2D(map, vUv); gl_FragColor = vec4(color.rgb * 0.85, color.a * uOpacity); }'
        ].join('\n');
        var wM = new THREE.ShaderMaterial({ uniforms: wU, vertexShader: wV, fragmentShader: wF, transparent: true, blending: THREE.NormalBlending, depthWrite: false });
        this.sphereFillMesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * PI * R, PI * R, 128, 64), wM);
        this.sphereFillMesh.renderOrder = 3; // render after ocean lines (1) to paint over them on land
        this.globeGroup.add(this.sphereFillMesh);
        this.morphMaterials.push(wM);
    };

    CommunityGlobe.prototype._buildGraticule = function() {
        var lat, lon, pts;
        for (lat = -80; lat <= 80; lat += 10) { pts = []; for (lon = -180; lon <= 180; lon += 3) pts.push({ lat: lat, lon: lon }); this.createMorphableLine(pts, this.graticuleMaterial); }
        for (lon = -180; lon <= 180; lon += 10) { pts = []; for (lat = -90; lat <= 90; lat += 3) pts.push({ lat: lat, lon: lon }); this.createMorphableLine(pts, this.graticuleMaterial); }
    };

    CommunityGlobe.prototype._buildGeoJSONVectors = function(gJ) {
        var self = this;
        gJ.features.forEach(function(f) {
            var pr = function(coords, mat) {
                var pts = [];
                for (var i = 0; i < coords.length; i++) {
                    if (i > 0 && Math.abs(coords[i][0] - coords[i - 1][0]) > 180) { if (pts.length > 1) self.createMorphableLine(pts, mat); pts = []; }
                    pts.push({ lat: coords[i][1], lon: coords[i][0] });
                }
                if (pts.length > 1) self.createMorphableLine(pts, mat);
            };
            if (f.geometry.type === 'Polygon') f.geometry.coordinates.forEach(function(r, i) { pr(r, i === 0 ? self.vectorMaterial : self.countryMaterial); });
            else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates.forEach(function(p) { p.forEach(function(r, i) { pr(r, i === 0 ? self.vectorMaterial : self.countryMaterial); }); });
            if (f.geometry.type === 'Polygon') pr(f.geometry.coordinates[0], self.countryMaterial);
            else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates.forEach(function(p) { pr(p[0], self.countryMaterial); });
        });
    };

    CommunityGlobe.prototype._buildLandDataVectors = function() {
        var self = this;
        this.LAND.forEach(function(p) { var pts = p.map(function(c) { return { lat: c[1], lon: c[0] }; }); if (pts.length > 1) self.createMorphableLine(pts, self.vectorMaterial); });
    };

    // =========================================================================
    // PROFILE MARKERS — Image cards with category-colored borders
    // =========================================================================
    CommunityGlobe.prototype.buildProfileMarkers = function() {
        var self = this;
        var gg = this.globeGroup;
        var cardSize = R * 0.08;
        var canvasSize = 256;
        var borderWidth = 8;
        var innerSize = canvasSize - borderWidth * 2;
        var cornerRadius = 20;

        this.people.forEach(function(person, idx) {
            var altitude = MARKER_ALT * (person.altitudeFactor || 1.0);
            person._markerRadius = R + R * altitude;
            var pos3D = latLonToVec3(person.displayLat, person.displayLon, person._markerRadius);
            var pos2D = latLonToFlat(person.displayLat, person.displayLon, R);
            pos2D.z = 0.05;
            var markerGroup = new THREE.Group();

            var canvas = document.createElement('canvas');
            canvas.width = canvasSize; canvas.height = canvasSize;
            var ctx = canvas.getContext('2d');
            self._drawCardCanvas(ctx, person, canvasSize, borderWidth, innerSize, cornerRadius);

            var tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;

            var cardMat = new THREE.ShaderMaterial({
                uniforms: { uMap: { value: tex }, uOpacity: { value: 1.0 }, uDimFactor: { value: 1.0 }, morphT: { value: 0.0 } },
                vertexShader: [
                    'uniform float morphT;', 'varying vec2 vUv;', 'varying vec3 vWorldPos;',
                    'void main() { vUv = uv;',
                    '    vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz;',
                    '    gl_Position = projectionMatrix * viewMatrix * wp; }'
                ].join('\n'),
                fragmentShader: [
                    'uniform sampler2D uMap;', 'uniform float uOpacity;', 'uniform float uDimFactor;', 'uniform float morphT;',
                    'varying vec2 vUv;', 'varying vec3 vWorldPos;',
                    'void main() {',
                    '    vec4 texColor = texture2D(uMap, vUv);',
                    '    vec3 n = normalize(vWorldPos);',
                    '    vec3 v = normalize(cameraPosition - vWorldPos);',
                    '    float f = dot(n, v);',
                    '    float fade3D = f > 0.1 ? 1.0 : 0.0;',
                    '    float fade = mix(fade3D, 1.0, morphT);',
                    '    gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity * fade * uDimFactor);',
                    '}'
                ].join('\n'),
                transparent: true, depthWrite: false, side: THREE.DoubleSide
            });

            var plane = new THREE.Mesh(new THREE.PlaneGeometry(cardSize, cardSize), cardMat);
            plane.renderOrder = 10; // render above continents (3), borders (4), connections (5)
            markerGroup.add(plane);
            markerGroup.position.copy(pos3D);
            var lookTarget = pos3D.clone().multiplyScalar(2);
            plane.lookAt(lookTarget);
            var quat3D = plane.quaternion.clone();
            var dummy = new THREE.Object3D();
            dummy.position.copy(pos2D);
            dummy.lookAt(new THREE.Vector3(pos2D.x, pos2D.y, pos2D.z + 100));
            var quat2D = dummy.quaternion.clone();
            gg.add(markerGroup);

            var hitbox = new THREE.Mesh(new THREE.PlaneGeometry(cardSize * 1.3, cardSize * 1.3), new THREE.MeshBasicMaterial({ visible: false }));
            hitbox.position.copy(pos3D); hitbox.lookAt(lookTarget);
            hitbox.userData = { personIndex: idx };
            gg.add(hitbox);

            var mats = [cardMat];
            self.markersList.push({
                group: markerGroup, plane: plane, ring: plane, pulse: plane, hitbox: hitbox, mats: mats,
                pos3D: pos3D, pos2D: pos2D, quat3D: quat3D, quat2D: quat2D, pulsePhase: 0,
                canvas: canvas, texture: tex, imageLoaded: false
            });
            self.profileMaterials.push(mats);

            var imgUrl = self.imageMode === 'work' ? (person.exampleThumb || person.imageThumb) : person.imageThumb;
            if (imgUrl) self._loadMarkerImage(idx, person, canvas, canvas.getContext('2d'), tex, canvasSize, borderWidth, innerSize, cornerRadius, imgUrl);
        });

        this._buildConnectionLines();
        this._buildOceanLines();
    };

    CommunityGlobe.prototype._drawCardCanvas = function(ctx, person, sz, bw, is, cr) {
        var cats = person.categories || [];
        ctx.clearRect(0, 0, sz, sz);
        ctx.save();
        ctx.beginPath(); roundedRect(ctx, 0, 0, sz, sz, cr); ctx.clip();

        if (cats.length > 1) {
            var cx = sz / 2, cy = sz / 2, sa = (2 * PI) / cats.length;
            cats.forEach(function(cat, i) {
                ctx.fillStyle = CATEGORY_COLORS[cat] || '#999';
                ctx.beginPath(); ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, sz, i * sa - PI / 2, (i + 1) * sa - PI / 2);
                ctx.closePath(); ctx.fill();
            });
        } else {
            ctx.fillStyle = person.primaryColor; ctx.fillRect(0, 0, sz, sz);
        }

        // CHANGE 4: colored background with white multi-initials
        ctx.beginPath(); roundedRect(ctx, bw, bw, is, is, cr - 3);
        ctx.fillStyle = person.primaryColor; ctx.fill();
        // Extract initials (first letter of each word, max 3)
        var words = (person.name || '?').split(/\s+/);
        var initials = words.map(function(w) { return w[0] ? w[0].toUpperCase() : ''; }).filter(Boolean).slice(0, 3).join('');
        if (!initials) initials = '?';
        var fontSize = initials.length > 2 ? 56 : (initials.length > 1 ? 68 : 80);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold ' + fontSize + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(initials, sz / 2, sz / 2);
        ctx.restore();
    };

    // FIX 5 + Change 9: load marker image with aspect-ratio-aware resizing for work mode
    CommunityGlobe.prototype._loadMarkerImage = function(idx, person, canvas, ctx, tex, sz, bw, is, cr, imageUrl) {
        var self = this;
        var url = imageUrl || person.imageThumb;
        if (!url) return;
        var img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = function() {
            var iw = img.naturalWidth || img.width;
            var ih = img.naturalHeight || img.height;
            var canvasW = sz, canvasH = sz;

            // FIX 5: in work mode, resize canvas to match image aspect ratio
            if (self.imageMode === 'work' && iw > 0 && ih > 0) {
                var aspect = iw / ih;
                if (aspect > 1) {
                    // Landscape: wider canvas, same height as square
                    canvasW = Math.min(Math.round(sz * aspect), 400);
                    canvasH = sz;
                } else if (aspect < 1) {
                    // Portrait: taller canvas, same width as square
                    canvasW = sz;
                    canvasH = Math.min(Math.round(sz / aspect), 400);
                }
            }

            // Resize canvas if needed
            canvas.width = canvasW;
            canvas.height = canvasH;
            var cbw = bw; // border width stays the same
            var ciw = canvasW - cbw * 2; // inner width
            var cih = canvasH - cbw * 2; // inner height

            ctx.clearRect(0, 0, canvasW, canvasH); ctx.save();
            ctx.beginPath(); roundedRect(ctx, 0, 0, canvasW, canvasH, cr); ctx.clip();
            var cats = person.categories || [];
            if (cats.length > 1) {
                var cx = canvasW / 2, cy = canvasH / 2, maxDim = Math.max(canvasW, canvasH);
                var sa = (2 * PI) / cats.length;
                cats.forEach(function(cat, i) { ctx.fillStyle = CATEGORY_COLORS[cat] || '#999'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, maxDim, i * sa - PI / 2, (i + 1) * sa - PI / 2); ctx.closePath(); ctx.fill(); });
            } else { ctx.fillStyle = person.primaryColor; ctx.fillRect(0, 0, canvasW, canvasH); }
            ctx.beginPath(); roundedRect(ctx, cbw, cbw, ciw, cih, cr - 3); ctx.clip();

            if (self.imageMode === 'work') {
                // Fit image within inner rect maintaining aspect ratio
                var fitScale = Math.min(ciw / iw, cih / ih);
                var sw = iw * fitScale, sh = ih * fitScale;
                ctx.fillStyle = person.primaryColor + '30';
                ctx.fillRect(cbw, cbw, ciw, cih);
                ctx.drawImage(img, cbw + (ciw - sw) / 2, cbw + (cih - sh) / 2, sw, sh);
            } else {
                // Profile mode: center-crop to square
                var scale = Math.max(ciw / iw, cih / ih);
                var sw2 = iw * scale, sh2 = ih * scale;
                ctx.drawImage(img, cbw + (ciw - sw2) / 2, cbw + (cih - sh2) / 2, sw2, sh2);
            }
            ctx.restore(); tex.needsUpdate = true;
            if (self.markersList[idx]) {
                self.markersList[idx].imageLoaded = true;

                // FIX 5: resize Three.js plane and hitbox to match canvas aspect ratio
                if (self.imageMode === 'work' && (canvasW !== sz || canvasH !== sz)) {
                    var marker = self.markersList[idx];
                    var cardW = self.baseCardSize * (canvasW / 256);
                    var cardH = self.baseCardSize * (canvasH / 256);
                    marker.plane.geometry.dispose();
                    marker.plane.geometry = new THREE.PlaneGeometry(cardW, cardH);
                    marker.hitbox.geometry.dispose();
                    marker.hitbox.geometry = new THREE.PlaneGeometry(cardW * 1.3, cardH * 1.3);
                }
            }
        };
        img.onerror = function() { console.warn('[awakening-earth-v3.1] Image load failed:', person.name, url); };
        setTimeout(function() { img.src = url; }, idx * 50);
    };

    // FIX 5 + Change 9: refresh all marker images when toggling, reset geometry for profile mode
    CommunityGlobe.prototype.refreshMarkerImages = function() {
        var self = this;
        var canvasSize = 256, borderWidth = 8, innerSize = 240, cornerRadius = 20;
        this.markersList.forEach(function(marker, idx) {
            var person = self.people[idx];
            if (!person) return;

            // FIX 5: when switching back to profile, reset canvas and geometry to square
            if (self.imageMode === 'profile') {
                if (marker.canvas.width !== canvasSize || marker.canvas.height !== canvasSize) {
                    marker.canvas.width = canvasSize;
                    marker.canvas.height = canvasSize;
                    marker.plane.geometry.dispose();
                    marker.plane.geometry = new THREE.PlaneGeometry(self.baseCardSize, self.baseCardSize);
                    marker.hitbox.geometry.dispose();
                    marker.hitbox.geometry = new THREE.PlaneGeometry(self.baseCardSize * 1.3, self.baseCardSize * 1.3);
                }
            }

            var url;
            if (self.imageMode === 'work') {
                url = person.exampleThumb || '';
                // For embeds, try YouTube thumbnail
                if (!url && person.exampleEmbed) url = extractYouTubeThumbnail(person.exampleEmbed);
                if (!url) url = person.imageThumb; // fallback to profile thumb
            } else {
                url = person.imageThumb;
            }
            var ctx = marker.canvas.getContext('2d');
            self._drawCardCanvas(ctx, person, marker.canvas.width, borderWidth, marker.canvas.width - borderWidth * 2, cornerRadius);
            marker.texture.needsUpdate = true;
            if (url) {
                self._loadMarkerImage(idx, person, marker.canvas, ctx, marker.texture, canvasSize, borderWidth, innerSize, cornerRadius, url);
            }
        });
    };

    CommunityGlobe.prototype._generateArc = function(startPos, endPos, segments) {
        var midPoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
        var midDir = midPoint.clone().normalize();
        var bowAmount = startPos.distanceTo(endPos) * 0.15;
        midPoint.add(midDir.clone().multiplyScalar(bowAmount));
        var points = [];
        for (var i = 0; i <= segments; i++) {
            var t = i / segments;
            var oneMinusT = 1 - t;
            points.push(new THREE.Vector3(
                oneMinusT * oneMinusT * startPos.x + 2 * oneMinusT * t * midPoint.x + t * t * endPos.x,
                oneMinusT * oneMinusT * startPos.y + 2 * oneMinusT * t * midPoint.y + t * t * endPos.y,
                oneMinusT * oneMinusT * startPos.z + 2 * oneMinusT * t * midPoint.z + t * t * endPos.z
            ));
        }
        return points;
    };

    CommunityGlobe.prototype._buildConnectionLines = function() {
        var self = this;
        this._connectionObjects = {};
        this.people.forEach(function(person, idx) {
            var color = new THREE.Color(person.primaryColor).getHex();
            var startRadius = person._markerRadius || (R * 1.075);
            var startPos = latLonToVec3(person.displayLat, person.displayLon, startRadius);
            var endPos = latLonToVec3(person.originalLat, person.originalLon, R);
            var arcPoints = self._generateArc(startPos, endPos, 20);

            var positions3D = new Float32Array(arcPoints.length * 3);
            var positions2D = new Float32Array(arcPoints.length * 3);
            var startFlat = latLonToFlat(person.displayLat, person.displayLon, R);
            var endFlat = latLonToFlat(person.originalLat, person.originalLon, R);

            arcPoints.forEach(function(pt, i) {
                positions3D[i * 3] = pt.x; positions3D[i * 3 + 1] = pt.y; positions3D[i * 3 + 2] = pt.z;
                var t = i / (arcPoints.length - 1);
                positions2D[i * 3] = startFlat.x + (endFlat.x - startFlat.x) * t;
                positions2D[i * 3 + 1] = startFlat.y + (endFlat.y - startFlat.y) * t;
                positions2D[i * 3 + 2] = 0.02;
            });

            var geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions3D, 3));
            geometry.setAttribute('pos2D', new THREE.BufferAttribute(positions2D, 3));
            var lineMat = self.createConnectionLineMaterial(color, 0.6);
            var line = new THREE.Line(geometry, lineMat);
            line.renderOrder = 6;
            self.globeGroup.add(line);

            // Dot — store both 3D and flat positions for morphing
            var dotPos3D = latLonToVec3(person.originalLat, person.originalLon, R * 1.002);
            var dotPosFlat = latLonToFlat(person.originalLat, person.originalLon, R);
            dotPosFlat.z = 0.02;
            var dot = new THREE.Mesh(
                new THREE.SphereGeometry(R * 0.004, 8, 8),
                new THREE.MeshBasicMaterial({ color: new THREE.Color(person.primaryColor), transparent: true, opacity: 0.8, depthWrite: false })
            );
            dot.position.copy(dotPos3D);
            dot.renderOrder = 6;
            dot._pos3D = dotPos3D;
            dot._posFlat = dotPosFlat;
            self.globeGroup.add(dot);
            self._connectionObjects[idx] = [line, dot];
        });
    };

    // =========================================================================
    // OCEAN LINES — animated colored lines on globe surface (globe view only)
    // =========================================================================
    CommunityGlobe.prototype._buildOceanLines = function() {
        var self = this;
        this._oceanLines.forEach(function(ol) { self.globeGroup.remove(ol); });
        this._oceanLines = [];

        var OCEAN_LINE_COUNT = 24;
        var VERTS_PER_LINE = 200;
        var lineRadius = R * 1.002;

        var oceanColors = [
            '#FF6B6B', '#FF8E53', '#FFBC42', '#65D572', '#4ECDC4', '#45B7D1',
            '#6C5CE7', '#A55EEA', '#FD79A8', '#00B894', '#0984E3', '#E17055',
            '#00CEC9', '#FF7675', '#FDCB6E', '#74B9FF', '#A29BFE', '#55EFC4',
            '#81ECEC', '#FAB1A0', '#DFE6E9', '#FF9FF3', '#F368E0', '#48DBFB'
        ];

        for (var i = 0; i < OCEAN_LINE_COUNT; i++) {
            var axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            var startVec = new THREE.Vector3(1, 0, 0);
            if (Math.abs(axis.dot(startVec)) > 0.9) startVec.set(0, 1, 0);
            startVec.cross(axis).normalize().multiplyScalar(lineRadius);

            var positions3D = new Float32Array(VERTS_PER_LINE * 3);
            var arcPositions = new Float32Array(VERTS_PER_LINE);

            for (var v = 0; v < VERTS_PER_LINE; v++) {
                var angle = (v / VERTS_PER_LINE) * Math.PI * 2;
                var pt = startVec.clone().applyAxisAngle(axis, angle);
                positions3D[v * 3] = pt.x;
                positions3D[v * 3 + 1] = pt.y;
                positions3D[v * 3 + 2] = pt.z;
                arcPositions[v] = v / VERTS_PER_LINE;
            }

            var geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions3D, 3));
            geometry.setAttribute('arcPos', new THREE.BufferAttribute(arcPositions, 1));

            var color = new THREE.Color(oceanColors[i % oceanColors.length]);
            var speed = 0.18 + Math.random() * 0.06;
            var segLen = 0.15 + Math.random() * 0.10; // visible segment 15-25%

            var mat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: Math.random() * 100 },
                    uSpeed: { value: speed },
                    uColor: { value: color },
                    uSegLen: { value: segLen }
                },
                vertexShader: [
                    'attribute float arcPos;',
                    'varying float vArcPos;',
                    'void main() {',
                    '  vArcPos = arcPos;',
                    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                    '}'
                ].join('\n'),
                fragmentShader: [
                    'uniform float uTime;',
                    'uniform float uSpeed;',
                    'uniform vec3 uColor;',
                    'uniform float uSegLen;',
                    'varying float vArcPos;',
                    'void main() {',
                    '  float headPos = fract(uTime * uSpeed);',
                    '  float dist = vArcPos - headPos;',
                    '  if (dist < 0.0) dist += 1.0;',
                    '  float tailDist = 1.0 - dist;',
                    '  if (tailDist > uSegLen) discard;',
                    '  float t = 1.0 - tailDist / uSegLen;',
                    '  float alpha = t * t * 0.45;',
                    '  gl_FragColor = vec4(uColor, alpha);',
                    '}'
                ].join('\n'),
                transparent: true, depthWrite: false, blending: THREE.NormalBlending
            });

            var line = new THREE.Line(geometry, mat);
            line.renderOrder = 2;
            self.globeGroup.add(line);
            self._oceanLines.push(line);
        }

        // Build flat background lines (shown only in flat view)
        this._buildFlatBgLines();
    };

    // =========================================================================
    // FLAT BACKGROUND LINES — decorative animated lines for flat view only
    // =========================================================================
    CommunityGlobe.prototype._buildFlatBgLines = function() {
        var self = this;
        if (this._flatBgLines) {
            this._flatBgLines.forEach(function(l) { self.globeGroup.remove(l); });
        }
        this._flatBgLines = [];

        var LINE_COUNT = 18;
        var VERTS = 100;
        var oceanColors = [
            '#FF6B6B', '#FF8E53', '#FFBC42', '#65D572', '#4ECDC4', '#45B7D1',
            '#6C5CE7', '#A55EEA', '#FD79A8', '#00B894', '#0984E3', '#E17055',
            '#00CEC9', '#FF7675', '#FDCB6E', '#74B9FF', '#A29BFE', '#55EFC4'
        ];
        var spreadX = FLAT_W * 0.8;
        var spreadY = FLAT_H * 0.8;

        for (var i = 0; i < LINE_COUNT; i++) {
            // Random straight line across the background
            var angle = Math.random() * Math.PI; // 0..PI (horizontal to vertical)
            var cx = (Math.random() - 0.5) * spreadX;
            var cy = (Math.random() - 0.5) * spreadY;
            var halfLen = R * (0.8 + Math.random() * 1.2);
            var dx = Math.cos(angle) * halfLen;
            var dy = Math.sin(angle) * halfLen;

            var positions = new Float32Array(VERTS * 3);
            var arcPositions = new Float32Array(VERTS);
            for (var v = 0; v < VERTS; v++) {
                var t = v / (VERTS - 1);
                positions[v * 3] = cx - dx + 2 * dx * t;
                positions[v * 3 + 1] = cy - dy + 2 * dy * t;
                positions[v * 3 + 2] = -0.01; // slightly behind map
                arcPositions[v] = t;
            }

            var geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('arcPos', new THREE.BufferAttribute(arcPositions, 1));

            var color = new THREE.Color(oceanColors[i % oceanColors.length]);
            var speed = 0.12 + Math.random() * 0.08;
            var segLen = 0.2 + Math.random() * 0.15;

            var mat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: Math.random() * 100 },
                    uSpeed: { value: speed },
                    uColor: { value: color },
                    uSegLen: { value: segLen }
                },
                vertexShader: [
                    'attribute float arcPos;',
                    'varying float vArcPos;',
                    'void main() {',
                    '  vArcPos = arcPos;',
                    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                    '}'
                ].join('\n'),
                fragmentShader: [
                    'uniform float uTime;',
                    'uniform float uSpeed;',
                    'uniform vec3 uColor;',
                    'uniform float uSegLen;',
                    'varying float vArcPos;',
                    'void main() {',
                    '  float headPos = fract(uTime * uSpeed);',
                    '  float dist = vArcPos - headPos;',
                    '  if (dist < 0.0) dist += 1.0;',
                    '  float tailDist = 1.0 - dist;',
                    '  if (tailDist > uSegLen) discard;',
                    '  float t = 1.0 - tailDist / uSegLen;',
                    '  float alpha = t * t * 0.25;',
                    '  gl_FragColor = vec4(uColor, alpha);',
                    '}'
                ].join('\n'),
                transparent: true, depthWrite: false, blending: THREE.NormalBlending
            });

            var line = new THREE.Line(geometry, mat);
            line.renderOrder = 1;
            line.visible = false; // hidden by default, shown in flat view
            self.globeGroup.add(line);
            self._flatBgLines.push(line);
        }
    };

    // =========================================================================
    // VIEW TOGGLE
    // =========================================================================
    CommunityGlobe.prototype.switchView = function(view) {
        if (view === this.currentView) return;
        var prevView = this.currentView;
        this.currentView = view;

        // Update tab buttons
        this.container.querySelectorAll('.cg-view-tab').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Handle gallery show/hide
        if (view === 'gallery') {
            // Hide Three.js canvas
            if (this.renderer && this.renderer.domElement) this.renderer.domElement.style.display = 'none';
            this.galleryContainer.classList.add('visible');
            this.buildGalleryCards();
            // If currently in 3D mode, save position
            if (!this.is2DMode && prevView === 'globe') {
                this._saved3DPosition = this.camera.position.clone();
                this._saved3DTarget = this.controls.target.clone();
            }
            return;
        }

        // Leaving gallery → show canvas
        if (prevView === 'gallery') {
            this.galleryContainer.classList.remove('visible');
            if (this.renderer && this.renderer.domElement) this.renderer.domElement.style.display = 'block';
        }

        if (view === 'flat') {
            if (!this.is2DMode) {
                this.is2DMode = true;
                this._saved3DPosition = this.camera.position.clone();
                this._saved3DTarget = this.controls.target.clone();
                this.controls.enableRotate = false; this.controls.enablePan = false;
                this.controls.enableZoom = false; this.controls.autoRotate = false;
                this.isPreparing2D = true; this.morphDir = 0;
            }
        } else if (view === 'globe') {
            if (this.is2DMode) {
                this.is2DMode = false;
                this._flatCameraPosition = this.camera.position.clone();
                this._flatCameraTarget = this.controls.target.clone();
                this.controls.enableRotate = false; this.controls.enablePan = false;
                this.controls.enableZoom = false; this.controls.autoRotate = false;
                this.isPreparing2D = false; this.morphDir = -1;
            }
        }
    };

    // =========================================================================
    // PROFILE CARD — Hover card (CHANGE 1: simplified with header row)
    // =========================================================================
    CommunityGlobe.prototype.showProfileCard = function(index, screenX, screenY) {
        var self = this;
        var data = this.people[index];
        if (!data) return;

        // Accent bar
        var accentEl = this.profileCard.querySelector('#cg-accent');
        if (accentEl) {
            if (data.categories.length > 1) {
                accentEl.style.background = 'linear-gradient(90deg, ' + data.categories.map(function(c) { return CATEGORY_COLORS[c] || '#999'; }).join(', ') + ')';
            } else { accentEl.style.background = data.primaryColor; }
        }

        // CHANGE 1: compact thumbnail in header row (use thumb for 44px circle)
        var thumbEl = this.profileCard.querySelector('#cg-thumb');
        if (data.imageThumb) { thumbEl.src = data.imageThumb; thumbEl.alt = data.name; thumbEl.style.display = 'block'; }
        else { thumbEl.style.display = 'none'; }

        this.profileCard.querySelector('#cg-name').textContent = data.name;

        var catsEl = this.profileCard.querySelector('#cg-categories');
        catsEl.innerHTML = '';
        (data.categories || []).forEach(function(cat) {
            var color = CATEGORY_COLORS[cat] || '#999';
            var span = document.createElement('span');
            span.className = 'pc-cat-badge';
            span.textContent = cat;
            span.style.background = color + '18';
            span.style.color = color;
            span.style.border = '1px solid ' + color + '40';
            catsEl.appendChild(span);
        });

        var locStr = '';
        if (data.country) {
            locStr = data.country;
            if (data.cityRegion) locStr += ', ' + data.cityRegion;
            if (data.altLocation && data.altLocation !== data.country) locStr += ' / ' + data.altLocation;
        } else if (data.altLocation) { locStr = data.altLocation; }
        this.profileCard.querySelector('#cg-location').textContent = locStr;

        // Example content
        var exampleEl = this.profileCard.querySelector('#cg-example');
        var exImgEl = this.profileCard.querySelector('#cg-example-img');
        var exEmbedEl = this.profileCard.querySelector('#cg-example-embed');
        if (data.exampleEmbed) {
            exEmbedEl.innerHTML = data.exampleEmbed; exEmbedEl.style.display = 'block';
            exImgEl.style.display = 'none'; exampleEl.style.display = 'block';
            // FIX 3: invisible embed overlay for pop-out player
            this._addEmbedOverlay(exEmbedEl, data);
        } else if (data.exampleThumb || data.exampleImageUrl) {
            exImgEl.src = data.exampleThumb || data.exampleImageUrl; exImgEl.alt = 'Example work';
            exImgEl.onerror = function() { exampleEl.style.display = 'none'; };
            exImgEl.style.display = 'block'; exEmbedEl.style.display = 'none'; exEmbedEl.innerHTML = '';
            exampleEl.style.display = 'block';
            // CHANGE 3: lightbox click handler (opens full-res image)
            exImgEl.onclick = function(e) { e.stopPropagation(); self.openLightbox(data.exampleImageUrl); };
        } else { exampleEl.style.display = 'none'; exEmbedEl.innerHTML = ''; }

        // Description (truncated for hover card)
        var descEl = this.profileCard.querySelector('#cg-description');
        var desc = data.description || '';
        descEl.textContent = desc.length > 200 ? desc.substring(0, 200) + '...' : desc;
        descEl.style.display = desc ? 'block' : 'none';

        // Position card
        var rect = this.container.getBoundingClientRect();
        var cardW = 340, cardH = 400;
        var left = screenX - rect.left + 20;
        var top = screenY - rect.top - cardH / 2;
        if (left + cardW > rect.width - 16) left = screenX - rect.left - cardW - 20;
        if (top < 16) top = 16;
        if (top + cardH > rect.height - 16) top = rect.height - cardH - 16;
        this.profileCard.style.left = left + 'px';
        this.profileCard.style.top = top + 'px';
        this.profileCard.classList.add('visible');

        this.activePersonIndex = index;
        this.highlightProfile(index);
        if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
    };

    CommunityGlobe.prototype.hideProfileCard = function() {
        var self = this;
        this.hideTimeout = setTimeout(function() {
            self.profileCard.classList.remove('visible');
            var embedEl = self.container.querySelector('#cg-example-embed');
            if (embedEl) embedEl.innerHTML = '';
            self.activePersonIndex = -1;
            self.resetHighlight();
        }, 200);
    };

    // =========================================================================
    // PINNED CARD — Change 6: persistent card on click
    // =========================================================================
    CommunityGlobe.prototype.pinProfileCard = function(index) {
        var self = this;
        var data = this.people[index];
        if (!data) return;

        // Hide hover card
        this.profileCard.classList.remove('visible');
        if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }

        this.pinnedPersonIndex = index;

        var accentEl = this.pinnedCard.querySelector('#pin-accent');
        if (accentEl) {
            if (data.categories.length > 1) {
                accentEl.style.background = 'linear-gradient(90deg, ' + data.categories.map(function(c) { return CATEGORY_COLORS[c] || '#999'; }).join(', ') + ')';
            } else { accentEl.style.background = data.primaryColor; }
        }

        var imgWrap = this.pinnedCard.querySelector('#pin-image-wrap');
        var imgEl = this.pinnedCard.querySelector('#pin-image');
        if (data.imageUrl) { imgEl.src = data.imageUrl; imgEl.alt = data.name; imgWrap.style.display = 'block'; }
        else imgWrap.style.display = 'none';

        this.pinnedCard.querySelector('#pin-name').textContent = data.name;

        var catsEl = this.pinnedCard.querySelector('#pin-categories');
        catsEl.innerHTML = '';
        (data.categories || []).forEach(function(cat) {
            var color = CATEGORY_COLORS[cat] || '#999';
            var span = document.createElement('span');
            span.className = 'pc-cat-badge';
            span.textContent = cat;
            span.style.background = color + '18';
            span.style.color = color;
            span.style.border = '1px solid ' + color + '40';
            catsEl.appendChild(span);
        });

        var pinLocStr = '';
        if (data.country) {
            pinLocStr = data.country;
            if (data.cityRegion) pinLocStr += ', ' + data.cityRegion;
            if (data.altLocation && data.altLocation !== data.country) pinLocStr += ' / ' + data.altLocation;
        } else if (data.altLocation) { pinLocStr = data.altLocation; }
        this.pinnedCard.querySelector('#pin-location').textContent = pinLocStr;

        // Example content
        var exampleEl = this.pinnedCard.querySelector('#pin-example');
        var exImgEl = this.pinnedCard.querySelector('#pin-example-img');
        var exEmbedEl = this.pinnedCard.querySelector('#pin-example-embed');
        if (data.exampleEmbed) {
            exEmbedEl.innerHTML = data.exampleEmbed; exEmbedEl.style.display = 'block';
            exImgEl.style.display = 'none'; exampleEl.style.display = 'block';
            // FIX 3: invisible embed overlay for pop-out player
            this._addEmbedOverlay(exEmbedEl, data);
        } else if (data.exampleThumb || data.exampleImageUrl) {
            exImgEl.src = data.exampleThumb || data.exampleImageUrl; exImgEl.alt = 'Example work';
            exImgEl.onerror = function() { exampleEl.style.display = 'none'; };
            exImgEl.style.display = 'block'; exEmbedEl.style.display = 'none'; exEmbedEl.innerHTML = '';
            exampleEl.style.display = 'block';
            // CHANGE 3: lightbox click handler (opens full-res image)
            exImgEl.onclick = function(e) { e.stopPropagation(); self.openLightbox(data.exampleImageUrl); };
        } else { exampleEl.style.display = 'none'; exEmbedEl.innerHTML = ''; }

        // Full description (no truncation for pinned card)
        var descEl = this.pinnedCard.querySelector('#pin-description');
        descEl.textContent = data.description || '';
        descEl.style.display = data.description ? 'block' : 'none';

        var awakEl = this.pinnedCard.querySelector('#pin-awakening');
        if (data.whyCollectiveAwakening) { awakEl.textContent = data.whyCollectiveAwakening; awakEl.style.display = 'block'; }
        else awakEl.style.display = 'none';

        var tagsEl = this.pinnedCard.querySelector('#pin-tags');
        tagsEl.innerHTML = '';
        (data.tags || []).forEach(function(tag) { var s = document.createElement('span'); s.className = 'pc-tag'; s.textContent = tag; tagsEl.appendChild(s); });

        var mediumEl = this.pinnedCard.querySelector('#pin-medium');
        mediumEl.innerHTML = '';
        (data.medium || []).forEach(function(m) { var s = document.createElement('span'); s.className = 'pc-medium-tag'; s.textContent = m; mediumEl.appendChild(s); });

        var linkEl = this.pinnedCard.querySelector('#pin-link');
        if (data.link) { linkEl.href = data.link; linkEl.style.display = 'block'; }
        else linkEl.style.display = 'none';

        this.pinnedCard.classList.add('visible');
    };

    // =========================================================================
    // EMBED OVERLAY — FIX 3: transparent overlay for pop-out player
    // =========================================================================
    CommunityGlobe.prototype._addEmbedOverlay = function(embedContainer, data) {
        var self = this;
        var overlay = document.createElement('div');
        overlay.className = 'pc-embed-overlay';
        overlay.title = 'Open in player';
        overlay.addEventListener('click', function(e) {
            e.stopPropagation();
            // Fade only this specific embed to 15% opacity, auto-restore after 2s
            embedContainer.style.opacity = '0.15';
            if (self._embedFadeTimeout) clearTimeout(self._embedFadeTimeout);
            self._embedFadeTimeout = setTimeout(function() {
                embedContainer.style.opacity = '1';
                self._embedFadeTimeout = null;
            }, 2000);
            self.popOutPlayer(data.exampleEmbed, data);
        });
        embedContainer.style.position = 'relative';
        embedContainer.appendChild(overlay);
    };

    CommunityGlobe.prototype.popOutPlayer = function(embedHtml, personData) {
        if (!embedHtml) return;
        var self = this;
        // Support legacy calls with string name
        if (typeof personData === 'string') personData = { name: personData };
        this._currentPlayerPerson = personData;

        var content = this.playerModal.querySelector('#cg-player-content');
        if (content) content.innerHTML = embedHtml;

        // Detect video (YouTube/Vimeo iframe)
        var isVideo = /youtube|vimeo|youtu\.be/i.test(embedHtml) || /<iframe/i.test(embedHtml);
        this.playerModal.classList.toggle('video-player', isVideo);

        // Build enhanced label with thumbnail + name + See More
        var label = this.playerModal.querySelector('#cg-player-label');
        if (label) {
            var thumbHtml = '';
            if (personData.imageThumb) {
                thumbHtml = '<img class="cg-player-thumb" src="' + personData.imageThumb + '" alt="">';
            }
            label.innerHTML =
                '<div class="cg-player-header">' +
                    thumbHtml +
                    '<div class="cg-player-info">' +
                        '<span class="cg-player-name">' + (personData.name || '') + '</span>' +
                        '<a class="cg-player-see-more" href="#">See More \u2192</a>' +
                    '</div>' +
                '</div>';

            // See More click → open pinned card (player stays open)
            var seeMoreLink = label.querySelector('.cg-player-see-more');
            if (seeMoreLink) {
                seeMoreLink.addEventListener('click', function(e) {
                    e.preventDefault(); e.stopPropagation();
                    var pIdx = -1;
                    for (var i = 0; i < self.people.length; i++) {
                        if (self.people[i].name === personData.name) { pIdx = i; break; }
                    }
                    if (pIdx >= 0) self.pinProfileCard(pIdx);
                });
            }
        }

        this.playerModal.classList.add('visible');
    };

    // =========================================================================
    // MARKER CLICK — Change 6: pin instead of open link
    // =========================================================================
    CommunityGlobe.prototype.handleMarkerClick = function(e) {
        var rect = this.container.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        var raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mx, my), this.camera);
        var hitboxes = this.markersList.map(function(m) { return m.hitbox; });
        var hits = raycaster.intersectObjects(hitboxes);
        if (hits.length > 0) {
            var hit = hits[0].object;
            if (this.morphTime < 0.5) {
                var mp = hit.position.clone(), n = mp.clone().normalize(), vd = this.camera.position.clone().sub(mp).normalize();
                if (n.dot(vd) < -0.05) return; // backface check: only reject if clearly behind globe
            }
            this.pinProfileCard(hit.userData.personIndex);
        }
    };

    // =========================================================================
    // HIGHLIGHT / DIM — Change 5: subtle 10% dim
    // =========================================================================
    CommunityGlobe.prototype.setAllDimTargets = function(val) {
        for (var i = 0; i < this.profileDimTargets.length; i++) {
            this.profileDimTargets[i] = this.people[i].visible ? val : 0.0;
        }
    };

    // Change 5: dimming changed from 0.15 to 0.9 (subtle 10% reduction)
    CommunityGlobe.prototype.highlightProfile = function(pIdx) { this.setAllDimTargets(0.9); this.profileDimTargets[pIdx] = 1.0; };
    CommunityGlobe.prototype.resetHighlight = function() { this.setAllDimTargets(1.0); };

    CommunityGlobe.prototype.updateDimFactors = function() {
        var speed = 0.1;
        this.profileMaterials.forEach(function(mats, pIdx) {
            var target = this.profileDimTargets[pIdx];
            mats.forEach(function(m) { if (m.uniforms && m.uniforms.uDimFactor) m.uniforms.uDimFactor.value += (target - m.uniforms.uDimFactor.value) * speed; });
        }.bind(this));
    };

    // =========================================================================
    // HOVER DETECTION
    // =========================================================================
    CommunityGlobe.prototype.checkMarkerHover = function(e) {
        var self = this;
        var rect = this.container.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        var raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mx, my), this.camera);
        var hits = raycaster.intersectObjects(this.markersList.map(function(m) { return m.hitbox; }));

        if (hits.length > 0) {
            var hit = hits[0].object;
            var pIdx = hit.userData.personIndex;
            if (!this.people[pIdx].visible) {
                this.renderer.domElement.style.cursor = 'default';
                this.hoveringMarker = false;
                this._hoverRaiseIdx = -1;
                if (this._hoverShowTimeout) { clearTimeout(this._hoverShowTimeout); this._hoverShowTimeout = null; this._pendingHoverIdx = -1; }
                if (this.activePersonIndex >= 0) this.hideProfileCard();
                return;
            }
            var mp = hit.position.clone();
            var visible = true;
            if (this.morphTime < 0.5) {
                var n = mp.clone().normalize(), vd = this.camera.position.clone().sub(mp).normalize();
                visible = n.dot(vd) > 0.05;
            }
            if (visible) {
                this._hoverRaiseIdx = pIdx;
                this.renderer.domElement.style.cursor = 'pointer';
                this.hoveringMarker = true;
                if (pIdx !== this.activePersonIndex && pIdx !== this._pendingHoverIdx) {
                    if (this._hoverShowTimeout) { clearTimeout(this._hoverShowTimeout); this._hoverShowTimeout = null; }
                    this._pendingHoverIdx = pIdx;
                    var wp = this.globeGroup.localToWorld(mp.clone());
                    var sp = wp.project(this.camera);
                    var _sx = (sp.x * 0.5 + 0.5) * rect.width + rect.left;
                    var _sy = (-sp.y * 0.5 + 0.5) * rect.height + rect.top;
                    this._hoverShowTimeout = setTimeout(function() {
                        self.showProfileCard(pIdx, _sx, _sy);
                        self._hoverShowTimeout = null;
                        self._pendingHoverIdx = -1;
                    }, 300);
                }
                return;
            }
        }
        this.renderer.domElement.style.cursor = 'default';
        this.hoveringMarker = false;
        this._hoverRaiseIdx = -1;
        if (this._hoverShowTimeout) { clearTimeout(this._hoverShowTimeout); this._hoverShowTimeout = null; this._pendingHoverIdx = -1; }
        if (this.activePersonIndex >= 0) this.hideProfileCard();
    };

    // =========================================================================
    // COORDINATE DISPLAY
    // =========================================================================
    CommunityGlobe.prototype.updateCoords = function(e) {
        if (this.morphTime > 0.5) return;
        var rect = this.container.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        var raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mx, my), this.camera);
        var sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), R);
        var target = new THREE.Vector3();
        if (raycaster.ray.intersectSphere(sphere, target)) {
            var lat = 90 - Math.acos(target.y / R) * 180 / PI;
            var lon = ((Math.atan2(target.z, -target.x) * 180 / PI) - 180 + 540) % 360 - 180;
            this.coordsEl.textContent = 'LAT ' + lat.toFixed(2) + '\u00b0 \u00b7 LON ' + lon.toFixed(2) + '\u00b0';
        }
    };

    // =========================================================================
    // LIGHTBOX — CHANGE 3: fullscreen image overlay
    // =========================================================================
    CommunityGlobe.prototype.openLightbox = function(src) {
        if (!this.lightbox || !src) return;
        var img = this.lightbox.querySelector('.cg-lightbox-img');
        if (img) img.src = src;
        this.lightbox.classList.add('visible');
    };

    CommunityGlobe.prototype.closeLightbox = function() {
        if (!this.lightbox) return;
        this.lightbox.classList.remove('visible');
        var img = this.lightbox.querySelector('.cg-lightbox-img');
        if (img) img.src = '';
    };

    // =========================================================================
    // GALLERY VIEW — build masonry grid of cards
    // =========================================================================
    CommunityGlobe.prototype._formatLocation = function(data) {
        var loc = '';
        if (data.country) {
            loc = data.country;
            if (data.cityRegion) loc += ', ' + data.cityRegion;
            if (data.altLocation && data.altLocation !== data.country) loc += ' / ' + data.altLocation;
        } else if (data.altLocation) { loc = data.altLocation; }
        return loc;
    };

    CommunityGlobe.prototype.buildGalleryCards = function() {
        if (!this.galleryContainer) return;
        this.galleryContainer.innerHTML = '';
        var self = this;

        // --- Gallery header (spans full width) ---
        var visibleCount = this.people.filter(function(p) { return p.visible; }).length;
        var header = document.createElement('div');
        header.className = 'cg-gallery-header';

        var seeAllActive = !self.activeFilters || self.activeFilters.size === 0;
        var filterBtns = '<button class="cg-gal-filter' + (seeAllActive ? ' active' : '') + '" data-cat="all">See All</button>';
        var cats = ['Visual Artist', 'Musician', 'Author', 'Community', 'Other'];
        cats.forEach(function(cat) {
            var color = CATEGORY_COLORS[cat] || '#999';
            var isActive = self.activeFilters && self.activeFilters.has(cat);
            filterBtns += '<button class="cg-gal-filter' + (isActive ? ' active' : '') + '" data-cat="' + cat + '" style="--cat-color:' + color + '">' +
                '<span class="cg-gal-dot" style="background:' + color + '"></span>' + cat + '</button>';
        });

        header.innerHTML =
            '<div class="cg-gal-title-row">' +
                '<h2 class="cg-gal-title">Our Awakening Earth</h2>' +
                '<span class="cg-gal-count">' + visibleCount + ' Creators</span>' +
            '</div>' +
            '<div class="cg-gal-filters">' + filterBtns + '</div>';

        this.galleryContainer.appendChild(header);

        // Bind gallery filter clicks (sync with main filters)
        header.querySelectorAll('.cg-gal-filter').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var cat = btn.dataset.cat;
                // Find the matching filter button in the left panel and click it
                var panelBtns = document.querySelectorAll('.cg-filter-btn');
                panelBtns.forEach(function(pb) {
                    if (pb.textContent.trim().replace(/^●\s*/, '') === cat || (cat === 'all' && pb.textContent.trim() === 'See All')) {
                        pb.click();
                    }
                });
            });
        });

        this.people.forEach(function(person, idx) {
            if (!person.visible) return;

            var card = document.createElement('div');
            card.className = 'cg-gallery-card';

            // Accent bar
            var accentColor = person.categories.length > 1
                ? 'linear-gradient(90deg, ' + person.categories.map(function(c) { return CATEGORY_COLORS[c] || '#999'; }).join(', ') + ')'
                : person.primaryColor;

            // Category badges
            var catBadges = (person.categories || []).map(function(cat) {
                var color = CATEGORY_COLORS[cat] || '#999';
                return '<span class="pc-cat-badge" style="background:' + color + '18;color:' + color + ';border:1px solid ' + color + '40">' + cat + '</span>';
            }).join('');

            // Thumbnail
            var thumbHtml = person.imageThumb
                ? '<img class="pc-thumb" src="' + person.imageThumb + '" alt="' + person.name + '">'
                : '<div class="pc-thumb" style="background:' + person.primaryColor + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:18px;">' + (person.name[0] || '?') + '</div>';

            // Example content
            var exampleHtml = '';
            if (person.exampleThumb || person.exampleImageUrl) {
                exampleHtml = '<div class="pc-example"><img class="pc-example-img gc-example-img" src="' + (person.exampleThumb || person.exampleImageUrl) + '" alt="Example work" data-idx="' + idx + '"></div>';
            } else if (person.exampleEmbed) {
                exampleHtml = '<div class="pc-example"><div class="pc-example-embed gc-embed" data-idx="' + idx + '" style="position:relative">' + person.exampleEmbed + '<div class="pc-embed-overlay gc-embed-overlay" data-idx="' + idx + '"></div></div></div>';
            }

            // Description (truncated)
            var desc = person.description || '';
            var truncDesc = desc.length > 200 ? desc.substring(0, 200) + '...' : desc;
            var descHtml = desc ? '<div class="pc-description">' + truncDesc + '</div>' : '';

            var locStr = self._formatLocation(person);

            card.innerHTML =
                '<div class="pc-accent" style="background:' + accentColor + '"></div>' +
                '<div class="pc-body">' +
                  '<div class="pc-header-row">' +
                    thumbHtml +
                    '<div class="pc-header-info">' +
                      '<div class="pc-name">' + person.name + '</div>' +
                      '<div class="pc-categories">' + catBadges + '</div>' +
                      '<div class="pc-location">' + locStr + '</div>' +
                    '</div>' +
                  '</div>' +
                  exampleHtml +
                  descHtml +
                  '<button class="pc-see-more gc-see-more" data-idx="' + idx + '">See More \u2192</button>' +
                '</div>';

            self.galleryContainer.appendChild(card);
        });

        // Event delegation for gallery
        this.galleryContainer.addEventListener('click', function(e) {
            // See More button
            var seeMore = e.target.closest('.gc-see-more');
            if (seeMore) {
                var idx = parseInt(seeMore.dataset.idx, 10);
                if (!isNaN(idx)) self.pinProfileCard(idx);
                return;
            }
            // Example image → lightbox
            var exImg = e.target.closest('.gc-example-img');
            if (exImg) {
                e.stopPropagation();
                var pIdx = parseInt(exImg.dataset.idx, 10);
                if (!isNaN(pIdx) && self.people[pIdx]) self.openLightbox(self.people[pIdx].exampleImageUrl);
                return;
            }
            // Embed overlay → player (fade specific embed, auto-unfade after 2s)
            var embedOverlay = e.target.closest('.gc-embed-overlay');
            if (embedOverlay) {
                e.stopPropagation();
                var eIdx = parseInt(embedOverlay.dataset.idx, 10);
                if (!isNaN(eIdx) && self.people[eIdx]) {
                    var embedContainer = embedOverlay.parentElement;
                    embedContainer.style.opacity = '0.15';
                    if (self._embedFadeTimeout) clearTimeout(self._embedFadeTimeout);
                    self._embedFadeTimeout = setTimeout(function() {
                        embedContainer.style.opacity = '1';
                        self._embedFadeTimeout = null;
                    }, 2000);
                    self.popOutPlayer(self.people[eIdx].exampleEmbed, self.people[eIdx]);
                }
                return;
            }
            // Click card body → pinned card
            var card = e.target.closest('.cg-gallery-card');
            if (card) {
                var btn = card.querySelector('.gc-see-more');
                if (btn) {
                    var cIdx = parseInt(btn.dataset.idx, 10);
                    if (!isNaN(cIdx)) self.pinProfileCard(cIdx);
                }
            }
        });
    };

    // =========================================================================
    // NOMINATION FORM — CHANGE 5: submit to Supabase
    // =========================================================================
    CommunityGlobe.prototype.submitNomination = async function() {
        var statusEl = this.nominateModal.querySelector('#nom-status');
        var submitBtn = this.nominateModal.querySelector('.cg-form-submit');

        var yourName = (this.nominateModal.querySelector('#nom-your-name').value || '').trim();
        var email = (this.nominateModal.querySelector('#nom-email').value || '').trim();
        var name = (this.nominateModal.querySelector('#nom-name').value || '').trim();

        if (!yourName) {
            statusEl.textContent = 'Your name is required.';
            statusEl.className = 'cg-form-status error';
            return;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            statusEl.textContent = 'A valid email is required.';
            statusEl.className = 'cg-form-status error';
            return;
        }
        if (!name) {
            statusEl.textContent = "Creator's name is required.";
            statusEl.className = 'cg-form-status error';
            return;
        }

        var imageUrl = (this.nominateModal.querySelector('#nom-image').value || '').trim();
        var description = (this.nominateModal.querySelector('#nom-description').value || '').trim();
        var link = (this.nominateModal.querySelector('#nom-link').value || '').trim();
        var reasoning = (this.nominateModal.querySelector('#nom-reasoning').value || '').trim();
        var location = (this.nominateModal.querySelector('#nom-location').value || '').trim();
        var consent = this.nominateModal.querySelector('#nom-consent').checked;

        // Collect selected categories
        var categories = [];
        this.nominateModal.querySelectorAll('.cg-form-cat-label input:checked').forEach(function(cb) {
            categories.push(cb.value);
        });

        submitBtn.disabled = true;
        statusEl.textContent = 'Submitting...';
        statusEl.className = 'cg-form-status';

        try {
            var payload = {
                form_type: 'nomination',
                submitter_name: yourName,
                submitter_email: email,
                creator_name: name,
                image_url: imageUrl || null,
                categories: categories,
                description: description || null,
                link: link || null,
                why_collective_awakening: reasoning || null,
                location: location || null,
                consent_updates: consent
            };

            var res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Server responded with ' + res.status);

            statusEl.textContent = 'Thank you! Your nomination has been submitted for review.';
            statusEl.className = 'cg-form-status success';

            // Reset form after short delay
            var self = this;
            setTimeout(function() {
                self.nominateModal.querySelector('#nom-your-name').value = '';
                self.nominateModal.querySelector('#nom-email').value = '';
                self.nominateModal.querySelector('#nom-name').value = '';
                self.nominateModal.querySelector('#nom-image').value = '';
                self.nominateModal.querySelector('#nom-description').value = '';
                self.nominateModal.querySelector('#nom-link').value = '';
                self.nominateModal.querySelector('#nom-reasoning').value = '';
                self.nominateModal.querySelector('#nom-location').value = '';
                self.nominateModal.querySelector('#nom-consent').checked = false;
                self.nominateModal.querySelectorAll('.cg-form-cat-label input').forEach(function(cb) {
                    cb.checked = false;
                    cb.parentElement.classList.remove('checked');
                });
                statusEl.textContent = '';
                self.nominateModal.classList.remove('visible');
            }, 2500);
        } catch (err) {
            console.error('[awakening-earth-v3.1] Nomination error:', err);
            statusEl.textContent = 'Error submitting. Please try again. ' + (err.message || '');
            statusEl.className = 'cg-form-status error';
        } finally {
            submitBtn.disabled = false;
        }
    };

    // =========================================================================
    // STAY CONNECTED FORM — submit to webhook
    // =========================================================================
    CommunityGlobe.prototype.submitStayConnected = async function() {
        var statusEl = this.stayConnectedModal.querySelector('#sc-status');
        var submitBtn = this.stayConnectedModal.querySelector('.cg-form-submit');

        var name = (this.stayConnectedModal.querySelector('#sc-name').value || '').trim();
        var email = (this.stayConnectedModal.querySelector('#sc-email').value || '').trim();
        var location = (this.stayConnectedModal.querySelector('#sc-location').value || '').trim();
        var note = (this.stayConnectedModal.querySelector('#sc-note').value || '').trim();
        var consent = this.stayConnectedModal.querySelector('#sc-consent').checked;

        if (!name) {
            statusEl.textContent = 'Name is required.';
            statusEl.className = 'cg-form-status error';
            return;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            statusEl.textContent = 'A valid email is required.';
            statusEl.className = 'cg-form-status error';
            return;
        }

        submitBtn.disabled = true;
        statusEl.textContent = 'Submitting...';
        statusEl.className = 'cg-form-status';

        try {
            var payload = {
                form_type: 'stay_connected',
                name: name,
                email: email,
                location: location || null,
                note: note || null,
                consent_updates: consent
            };

            var res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Server responded with ' + res.status);

            statusEl.textContent = 'Thank you for connecting with us!';
            statusEl.className = 'cg-form-status success';

            var self = this;
            setTimeout(function() {
                self.stayConnectedModal.querySelector('#sc-name').value = '';
                self.stayConnectedModal.querySelector('#sc-email').value = '';
                self.stayConnectedModal.querySelector('#sc-location').value = '';
                self.stayConnectedModal.querySelector('#sc-note').value = '';
                self.stayConnectedModal.querySelector('#sc-consent').checked = false;
                statusEl.textContent = '';
                self.stayConnectedModal.classList.remove('visible');
            }, 2500);
        } catch (err) {
            console.error('[awakening-earth-v3.1] Stay Connected error:', err);
            statusEl.textContent = 'Error submitting. Please try again. ' + (err.message || '');
            statusEl.className = 'cg-form-status error';
        } finally {
            submitBtn.disabled = false;
        }
    };

    // =========================================================================
    // ANIMATION LOOP — Change 1: dynamic card sizing
    // =========================================================================
    CommunityGlobe.prototype.animate = function() {
        if (this.animating) return;
        this.animating = true;
        var self = this;

        function loop() {
            requestAnimationFrame(loop);

            if (self.isPreparing2D) {
                var cs = new THREE.Spherical().setFromVector3(self.camera.position);
                var tR = 22, tP = PI / 2, tT = 0;
                var td = tT - cs.theta; td = Math.atan2(Math.sin(td), Math.cos(td));
                var ls = 0.06;
                cs.theta += td * ls; cs.phi += (tP - cs.phi) * ls; cs.radius += (tR - cs.radius) * ls;
                self.camera.position.setFromSpherical(cs);
                self.controls.target.lerp(new THREE.Vector3(0, 0, 0), ls);
                var tQ = new THREE.Quaternion(0, 0, 0, 1);
                self.globeGroup.quaternion.slerp(tQ, ls);
                if (Math.abs(cs.radius - tR) < 0.5 && Math.abs(td) < 0.03 && self.globeGroup.quaternion.angleTo(tQ) < 0.03) {
                    self.camera.position.set(0, 0, tR); self.globeGroup.quaternion.copy(tQ);
                    self.isPreparing2D = false; self.morphDir = 1;
                    self.controls.enablePan = true; self.controls.enableZoom = true; self.controls.enableRotate = false;
                    self.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
                }
            }

            if (self.morphDir !== 0) {
                self.morphTime += self.morphDir * 0.012;
                if (self.morphTime >= 1.0) { self.morphTime = 1.0; self.morphDir = 0; }
                if (self.morphTime <= 0.0) {
                    self.morphTime = 0.0; self.morphDir = 0;
                    self.controls.enableRotate = true; self.controls.enablePan = false;
                    self.controls.enableZoom = true; self.controls.autoRotate = true;
                    self.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
                    if (self._saved3DPosition) { self.camera.position.copy(self._saved3DPosition); self.controls.target.copy(self._saved3DTarget); }
                    self._saved3DPosition = null; self._saved3DTarget = null;
                    self._flatCameraPosition = null; self._flatCameraTarget = null;
                }
            }

            var mt = self.morphTime;
            var fadeOut3D = Math.max(0, 1.0 - (mt / 0.2));
            var morphProg = Math.max(0, Math.min(1, (mt - 0.2) / 0.6));
            var easedMorph = morphProg < 0.5 ? 2 * morphProg * morphProg : 1 - Math.pow(-2 * morphProg + 2, 2) / 2;

            self.morphMaterials.forEach(function(mat) { mat.uniforms.morphT.value = easedMorph; });
            if (self._innerSphereMat) self._innerSphereMat.uniforms.uOpacity.value = fadeOut3D * 0.35;
            if (self._shadowMat) self._shadowMat.opacity = fadeOut3D;
            if (self._glowMat) { self._glowMat.uniforms.morphT.value = mt; self._glowMat.uniforms.viewVector.value = self.camera.position; }
            if (self.starMat) self.starMat.uniforms.uFade.value = 1.0 - mt;

            // Change 1: dynamic card sizing based on camera distance
            var camDist = self.camera.position.length();
            var targetScale = THREE.MathUtils.mapLinear(camDist, 10, 35, 0.7, 1.8);
            targetScale = THREE.MathUtils.clamp(targetScale, 0.7, 1.8);

            self.markersList.forEach(function(m, mIdx) {
                m.group.position.lerpVectors(m.pos3D, m.pos2D, easedMorph);
                m.ring.quaternion.slerpQuaternions(m.quat3D, m.quat2D, easedMorph);
                m.pulse.quaternion.slerpQuaternions(m.quat3D, m.quat2D, easedMorph);
                m.hitbox.position.lerpVectors(m.pos3D, m.pos2D, easedMorph);
                m.mats.forEach(function(mat) { if (mat.uniforms && mat.uniforms.morphT) mat.uniforms.morphT.value = easedMorph; });

                // Change 1: smooth scale lerp
                m.group.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);

                // Hover raise animation — push hovered card outward in globe view
                var raiseTarget = (mIdx === self._hoverRaiseIdx) ? R * 0.015 : 0;
                if (m._currentRaise === undefined) m._currentRaise = 0;
                m._currentRaise += (raiseTarget - m._currentRaise) * 0.12;
                if (Math.abs(m._currentRaise) > 0.0001 && easedMorph < 0.5) {
                    var raiseDir = m.pos3D.clone().normalize();
                    var raiseOffset = raiseDir.multiplyScalar(m._currentRaise);
                    m.group.position.add(raiseOffset);
                    m.hitbox.position.add(raiseOffset);
                }

                if (easedMorph < 1.0) {
                    var vd = new THREE.Vector3().subVectors(self.camera.position, m.group.position).normalize();
                    var n = new THREE.Vector3().lerpVectors(m.pos3D.clone().normalize(), new THREE.Vector3(0, 0, 1), easedMorph).normalize();
                    var dp = n.dot(vd);
                    var ba = THREE.MathUtils.smoothstep(dp, -0.2, 0.2);
                    var fa = THREE.MathUtils.lerp(0.25 + ba * 0.75, 1.0, easedMorph);
                    m.mats.forEach(function(mat) {
                        if (mat.uniforms && mat.uniforms.uOpacity && mat._baseOp === undefined) mat._baseOp = mat.uniforms.uOpacity.value;
                        if (mat.uniforms && mat.uniforms.uOpacity && mat._baseOp !== undefined) mat.uniforms.uOpacity.value = mat._baseOp * fa;
                    });
                }
            });

            // Morph connection dots between 3D and flat positions + update camera uniform
            var camPosWorld = self.camera.position.clone();
            Object.keys(self._connectionObjects).forEach(function(key) {
                var pair = self._connectionObjects[key];
                var line = pair[0], dot = pair[1];
                // Morph dot position
                if (dot._pos3D && dot._posFlat) {
                    dot.position.lerpVectors(dot._pos3D, dot._posFlat, easedMorph);
                }
                // Update camera position for connection line facing check
                if (line.material.uniforms && line.material.uniforms.uCamPos) {
                    line.material.uniforms.uCamPos.value.copy(camPosWorld);
                }
                // Hide dot if on back side of globe (globe mode only)
                if (dot._pos3D && dot.visible) {
                    if (easedMorph < 0.5) {
                        var dn = dot._pos3D.clone().normalize();
                        var dv = camPosWorld.clone().sub(dot._pos3D).normalize();
                        var dotFacing = dn.dot(dv);
                        dot.material.opacity = dotFacing > 0.15 ? 0.8 : 0.0;
                    } else {
                        dot.material.opacity = 0.8;
                    }
                }
            });

            // Update ocean line time + hide in flat view
            self._oceanLineTime += 0.016;
            self._oceanLines.forEach(function(ol) {
                ol.material.uniforms.uTime.value = self._oceanLineTime;
                ol.visible = easedMorph < 0.5; // hide ocean lines in flat view
            });
            // Show/hide flat background lines
            if (self._flatBgLines) {
                self._flatBgLines.forEach(function(fl) {
                    fl.visible = easedMorph > 0.5;
                    if (fl.material.uniforms) fl.material.uniforms.uTime.value = self._oceanLineTime;
                });
            }

            if (self.morphDir === 0 && !self.is2DMode && !self.isPreparing2D && mt === 0) self.controls.autoRotate = !self.hoveringMarker;
            else self.controls.autoRotate = false;

            if (self.morphDir !== 0) self.controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.06);
            else if (self.is2DMode && !self.isPreparing2D) self.globeGroup.quaternion.slerp(new THREE.Quaternion(0, 0, 0, 1), 0.1);

            self.updateDimFactors();
            self.controls.update();

            if (self.morphDir === -1 && self._saved3DPosition && self._flatCameraPosition) {
                var rT = 1.0 - mt; var eR = rT * rT * (3.0 - 2.0 * rT);
                self.camera.position.lerpVectors(self._flatCameraPosition, self._saved3DPosition, eR);
                self.controls.target.lerpVectors(self._flatCameraTarget, self._saved3DTarget, eR);
            }

            self.renderer.render(self.scene, self.camera);
        }
        loop();
    };

    // =========================================================================
    // EVENTS
    // =========================================================================
    CommunityGlobe.prototype.bindEvents = function() {
        var self = this;
        var cv = this.renderer.domElement;
        var dragStart = null;

        cv.addEventListener('mousedown', function(e) { dragStart = { x: e.clientX, y: e.clientY }; });
        cv.addEventListener('mousemove', function(e) {
            if (!dragStart) { self.checkMarkerHover(e); }
            else if (self.activePersonIndex >= 0) {
                var dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
                if (Math.sqrt(dx * dx + dy * dy) > 3) { self.profileCard.classList.remove('visible'); self.activePersonIndex = -1; }
            }
            self.updateCoords(e);
        });
        cv.addEventListener('mouseup', function(e) {
            if (dragStart) {
                var dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
                if (Math.sqrt(dx * dx + dy * dy) < 5) self.handleMarkerClick(e);
                dragStart = null;
            }
        });
        cv.addEventListener('mouseleave', function() { dragStart = null; });
        // Touch support for mobile marker interaction
        var touchStart = null;
        cv.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
        }, { passive: true });
        cv.addEventListener('touchend', function(e) {
            if (!touchStart) return;
            var touch = e.changedTouches[0];
            var dx = touch.clientX - touchStart.x, dy = touch.clientY - touchStart.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var dt = Date.now() - touchStart.time;
            touchStart = null;
            // Only treat as tap if short distance and short duration
            if (dist < 15 && dt < 400) {
                var fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
                self.handleMarkerClick(fakeEvent);
            }
        }, { passive: true });

        // ESC key handler for lightbox, player, and nomination modal
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (self.welcomeModal && self.welcomeModal.classList.contains('visible')) {
                    self._closeWelcome();
                } else if (self.lightbox && self.lightbox.classList.contains('visible')) {
                    self.closeLightbox();
                } else if (self.playerModal && self.playerModal.classList.contains('visible')) {
                    self.playerModal.classList.remove('visible', 'expanded', 'video-player');
                    self.playerExpanded = false;
                    var pc = self.playerModal.querySelector('#cg-player-content');
                    if (pc) pc.innerHTML = '';
                } else if (self.pinnedCard && self.pinnedCard.classList.contains('visible')) {
                    self.pinnedCard.classList.remove('visible');
                    self.pinnedPersonIndex = -1;
                } else if (self.stayConnectedModal && self.stayConnectedModal.classList.contains('visible')) {
                    self.stayConnectedModal.classList.remove('visible');
                } else if (self.nominateModal && self.nominateModal.classList.contains('visible')) {
                    self.nominateModal.classList.remove('visible');
                }
            }
        });
        window.addEventListener('resize', function() {
            var w = self.container.clientWidth;
            var h = self.container.clientHeight || (self.container.parentElement && self.container.parentElement.clientHeight) || window.innerHeight;
            self.camera.aspect = w / h; self.camera.updateProjectionMatrix(); self.renderer.setSize(w, h);
        });
    };

    window.CommunityGlobe = new CommunityGlobe();
})();
