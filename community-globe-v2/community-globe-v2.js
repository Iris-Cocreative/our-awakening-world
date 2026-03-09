/**
 * Community Globe V2 Component
 * Interactive 3D globe with morphing 3D-to-2D transitions, GeoJSON country borders,
 * improved continent rendering, semi-transparency, and smooth OrbitControls navigation.
 * 
 * Improvements over V1:
 * 1) Better continent fills and coastlines using GeoJSON (higher fidelity when zoomed in)
 * 2) Country border lines (faint, below continent outline opacity)
 * 3) Smoother 3D navigation using OrbitControls with damping
 * 4) Animated 3D sphere-to-plane morphing transition (Gemini-inspired staged animation)
 * 5) Semi-transparent globe with see-through effect
 *
 * Requires Three.js r128, OrbitControls, and land-data.js to be loaded first.
 */

(function() {
    'use strict';

    var R = 6.371;
    var FLAT_W = R * 2.2;
    var FLAT_H = R * 1.1;
    var PI = Math.PI;

    // GeoJSON URL for country boundaries
    var GEOJSON_URL = 'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson';

    function CommunityGlobe() {
        this.config = { containerId: 'community-globe' };
        this.container = null;
        this.supabase = null;
        this.people = [];
        this.holons = [];
        this.LAND = [];
        this.geoJsonData = null;
        // Three.js core
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.globeGroup = null;
        this.starGroup = null;
        this.starMat = null;
        // Morph state (Gemini-inspired staged animation)
        this.morphTime = 0.0;
        this.morphDir = 0;    // 1 = morphing to 2D, -1 = morphing to 3D
        this.is2DMode = false;
        this.isPreparing2D = false;
        // Morphable materials and geometries
        this.morphMaterials = [];       // All materials with morphT uniform
        this.vectorMaterial = null;     // Continent outlines
        this.countryMaterial = null;    // Country borders (faint)
        this.graticuleMaterial = null;  // Grid lines
        this.innerSphere = null;
        this.sphereFillMesh = null;
        this.planeFillMesh = null;
        // Markers
        this.markersList = [];
        this.holonMarkersList = [];
        this.arcLines = [];
        this.connectionLines = [];
        // Interaction state
        this.hoveringMarker = false;
        this.activePersonIndex = -1;
        this.activeIsHolon = false;
        this.hideTimeout = null;
        // Materials arrays for dimming
        this.profileMaterials = [];
        this.holonMaterials = [];
        this.profileDimTargets = [];
        this.holonDimTargets = [];
        // DOM refs
        this.profileCard = null;
        this.coordsEl = null;
        this.animating = false;
        // Saved orbit state for returning from 2D
        this._saved3DPosition = null;
        this._saved3DTarget = null;
    }

    // =========================================================================
    // INIT
    // =========================================================================
    CommunityGlobe.prototype.init = async function(options) {
        console.log('[community-globe-v2] Initializing...');
        Object.assign(this.config, options || {});
        this.container = document.getElementById(this.config.containerId);
        if (!this.container) return;
        this.container.classList.add('cg-wrapper');
        this.LAND = window.LAND_DATA || [];

        try {
            this.initSupabase();
            await Promise.all([
                this.fetchData(),
                this.fetchGeoJSON()
            ]);
            this.buildDOM();
            this.initScene();
            this.buildStars();
            this.buildGlobe();
            this.buildProfileMarkers();
            this.buildHolonMarkers();
            this.buildGreatCircleArcs();
            this.bindEvents();
            this.animate();
            // Dismiss loading
            var loading = this.container.querySelector('.cg-loading');
            if (loading) {
                setTimeout(function() {
                    loading.classList.add('fade-out');
                    setTimeout(function() { loading.remove(); }, 1000);
                }, 400);
            }
        } catch (err) {
            console.error('[community-globe-v2] Init error:', err);
            this.container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:400px;color:#a0dce4;">Error loading globe. Please refresh.</div>';
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
            console.log('[community-globe-v2] GeoJSON loaded:', this.geoJsonData.features.length, 'features');
        } catch (err) {
            console.warn('[community-globe-v2] GeoJSON fetch failed, falling back to LAND_DATA:', err);
            this.geoJsonData = null;
        }
    };

    // =========================================================================
    // DATA FETCHING (same as V1)
    // =========================================================================
    CommunityGlobe.prototype.fetchData = async function() {
        console.log('[community-globe-v2] Fetching data...');
        var sb = this.supabase;

        var profilesRes = await sb.from('profiles')
            .select('id, full_name, avatar_url, banner_url, bio, location, role, company, slug, latitude, longitude')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null);

        var profiles = (profilesRes.data || []).filter(function(p) {
            return p.latitude && p.longitude;
        });

        var holonsRes = await sb.from('holons')
            .select('id, name, slug, description, short_description, holon_image, banner_url');
        if (holonsRes.error) console.warn('[community-globe-v2] Holons query error:', holonsRes.error.message);
        var allHolons = holonsRes.data || [];

        var membersRes = await sb.from('holon_members').select('holon_id, profile_id, role');
        var membersData = membersRes.data || [];

        console.log('[community-globe-v2] Data counts — profiles:', profiles.length,
            '| holons:', allHolons.length, '| holon_members rows:', membersData.length);

        var profileTagsRes = await sb.from('profile_tags').select('profile_id, tags(id, name)');
        var profileTagsData = profileTagsRes.data || [];
        var profileCatsRes = await sb.from('profile_categories').select('profile_id, categories(id, name)');
        var profileCatsData = profileCatsRes.data || [];
        var holonTagsRes = await sb.from('entity_tags').select('entity_id, tags(id, name)').eq('entity_type', 'holon');
        var holonTagsData = holonTagsRes.data || [];
        var holonCatsRes = await sb.from('entity_categories').select('entity_id, categories(id, name)').eq('entity_type', 'holon');
        var holonCatsData = holonCatsRes.data || [];

        var profileById = {};
        profiles.forEach(function(p, idx) { profileById[p.id] = idx; });

        var profileTagsMap = {};
        profileTagsData.forEach(function(pt) {
            if (!profileTagsMap[pt.profile_id]) profileTagsMap[pt.profile_id] = [];
            if (pt.tags) profileTagsMap[pt.profile_id].push(pt.tags.name);
        });
        var profileCatsMap = {};
        profileCatsData.forEach(function(pc) {
            if (!profileCatsMap[pc.profile_id]) profileCatsMap[pc.profile_id] = [];
            if (pc.categories) profileCatsMap[pc.profile_id].push(pc.categories.name);
        });
        var holonTagsMap = {};
        holonTagsData.forEach(function(ht) {
            if (!holonTagsMap[ht.entity_id]) holonTagsMap[ht.entity_id] = [];
            if (ht.tags) holonTagsMap[ht.entity_id].push(ht.tags.name);
        });
        var holonCatsMap = {};
        holonCatsData.forEach(function(hc) {
            if (!holonCatsMap[hc.entity_id]) holonCatsMap[hc.entity_id] = [];
            if (hc.categories) holonCatsMap[hc.entity_id].push(hc.categories.name);
        });

        this.people = profiles.map(function(p) {
            var name = p.full_name || 'Member';
            var words = name.split(' ');
            var initials = words.length >= 2
                ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
                : name.substring(0, 2).toUpperCase();
            return {
                id: p.id, lat: parseFloat(p.latitude), lon: parseFloat(p.longitude),
                name: name, initials: initials,
                role: [p.role, p.company].filter(Boolean).join(' \u00b7 ') || '',
                location: p.location || '', bio: p.bio || '',
                avatar_url: p.avatar_url || '', banner_url: p.banner_url || '',
                slug: p.slug || '',
                tags: profileTagsMap[p.id] || [], categories: profileCatsMap[p.id] || []
            };
        });

        var holonMembersMap = {};
        var holonAllMembersMap = {};
        membersData.forEach(function(m) {
            if (!holonAllMembersMap[m.holon_id]) holonAllMembersMap[m.holon_id] = [];
            holonAllMembersMap[m.holon_id].push(m.profile_id);
            if (!holonMembersMap[m.holon_id]) holonMembersMap[m.holon_id] = [];
            if (profileById[m.profile_id] !== undefined) {
                holonMembersMap[m.holon_id].push(profileById[m.profile_id]);
            }
        });

        var self = this;
        this.holons = [];
        allHolons.forEach(function(h) {
            var memberIdxs = holonMembersMap[h.id] || [];
            var cx = 0, cy = 0, cz = 0, count = 0;
            memberIdxs.forEach(function(idx) {
                var m = self.people[idx];
                if (m && !isNaN(m.lat) && !isNaN(m.lon)) {
                    var phi = (90 - m.lat) * PI / 180;
                    var theta = (m.lon + 180) * PI / 180;
                    cx += -Math.sin(phi) * Math.cos(theta);
                    cy += Math.cos(phi);
                    cz += Math.sin(phi) * Math.sin(theta);
                    count++;
                }
            });
            if (count === 0) return;
            cx /= count; cy /= count; cz /= count;
            var r = Math.sqrt(cx * cx + cy * cy + cz * cz);
            var lat = 90 - Math.acos(cy / r) * 180 / PI;
            var lon = Math.atan2(cz, -cx) * 180 / PI - 180;
            if (lon < -180) lon += 360;
            if (lon > 180) lon -= 360;

            var name = h.name || 'Holon';
            self.holons.push({
                id: h.id, lat: lat, lon: lon, name: name,
                initials: name.substring(0, 2).toUpperCase(),
                type: 'Holon',
                description: h.short_description || h.description || '',
                slug: h.slug || '', image_url: h.holon_image || '',
                banner_url: h.banner_url || '',
                memberIndices: memberIdxs,
                tags: holonTagsMap[h.id] || [], categories: holonCatsMap[h.id] || []
            });
        });

        this.profileDimTargets = this.people.map(function() { return 1.0; });
        this.holonDimTargets = this.holons.map(function() { return 1.0; });

        console.log('[community-globe-v2] Loaded', this.people.length, 'profiles,', this.holons.length, 'holons');
    };

    // =========================================================================
    // DOM (same UI as V1)
    // =========================================================================
    CommunityGlobe.prototype.buildDOM = function() {
        this.container.innerHTML = '';

        var loading = document.createElement('div');
        loading.className = 'cg-loading';
        loading.innerHTML = '<div class="cg-loading-text">Generating Globe</div>';
        this.container.appendChild(loading);

        this.profileCard = document.createElement('div');
        this.profileCard.className = 'cg-card';
        this.profileCard.innerHTML =
            '<div class="cg-card-inner">' +
              '<div class="pc-banner" id="cg-banner"></div>' +
              '<div class="pc-header">' +
                '<div class="pc-avatar" id="cg-avatar"></div>' +
                '<div><div class="pc-name" id="cg-name"></div><div class="pc-role" id="cg-role"></div></div>' +
              '</div>' +
              '<div class="pc-location" id="cg-location"></div>' +
              '<div class="pc-bio" id="cg-bio"></div>' +
              '<div class="pc-tags" id="cg-tags"></div>' +
              '<a class="pc-link" id="cg-link" href="#" target="_blank">View Profile</a>' +
            '</div>';
        this.container.appendChild(this.profileCard);

        var info = document.createElement('div');
        info.className = 'cg-info';
        info.innerHTML = '<h1>Community Globe</h1><p>' + this.people.length + ' Members \u00b7 ' + this.holons.length + ' Holons</p>';
        this.container.appendChild(info);

        this.coordsEl = document.createElement('div');
        this.coordsEl.className = 'cg-coords';
        this.coordsEl.textContent = 'LAT 0.00\u00b0 \u00b7 LON 0.00\u00b0';
        this.container.appendChild(this.coordsEl);

        var controls = document.createElement('div');
        controls.className = 'cg-controls';
        controls.innerHTML = 'Drag to rotate \u00b7 Scroll to zoom<br>Click marker to visit profile';
        this.container.appendChild(controls);

        var self = this;
        var toggle = document.createElement('div');
        toggle.className = 'cg-toggle';
        toggle.innerHTML =
            '<span class="cg-lbl active" id="cg-lbl-globe">Globe</span>' +
            '<div class="cg-toggle-track" id="cg-toggle-track"><div class="cg-toggle-thumb"></div></div>' +
            '<span class="cg-lbl" id="cg-lbl-flat">Flat</span>';
        toggle.addEventListener('click', function() { self.toggleView(); });
        this.container.appendChild(toggle);
    };

    // =========================================================================
    // THREE.JS SCENE (with OrbitControls for smoother 3D navigation)
    // =========================================================================
    CommunityGlobe.prototype.initScene = function() {
        var w = this.container.clientWidth;
        var h = this.container.clientHeight
            || (this.container.parentElement && this.container.parentElement.clientHeight)
            || window.innerHeight;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
        this.camera.position.set(0, 2, 18);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.container.appendChild(this.renderer.domElement);

        // OrbitControls for smooth navigation
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
        return new THREE.Vector3(
            -r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }

    function latLonToFlat(lat, lon, r) {
        var x = (lon / 180) * PI * r;
        var y = (lat / 90) * (PI / 2) * r;
        return new THREE.Vector3(x, y, 0);
    }

    // =========================================================================
    // MORPHABLE SHADER MATERIAL (Gemini-inspired)
    // Handles vertex morphing between 3D sphere and 2D plane on GPU
    // =========================================================================
    CommunityGlobe.prototype.createMorphShaderMaterial = function(maxOpacity, color) {
        var tealColor = color || 0x40c0d0;
        var mat = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(tealColor) },
                morphT: { value: 0.0 },
                maxOpacity: { value: maxOpacity },
                uDimFactor: { value: 1.0 }
            },
            vertexShader: [
                'attribute vec3 pos2D;',
                'uniform float morphT;',
                'uniform float maxOpacity;',
                'varying float vAlpha;',
                '',
                'void main() {',
                '    vec3 currentPos = mix(position, pos2D, morphT);',
                '',
                '    // Blend normals: sphere normal vs flat plane normal',
                '    vec3 normal3D = normalize(position);',
                '    vec3 normal2D = vec3(0.0, 0.0, 1.0);',
                '    vec3 currentNormal = normalize(mix(normal3D, normal2D, morphT));',
                '',
                '    vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0);',
                '    vec3 viewDir = normalize(-mvPosition.xyz);',
                '    vec3 nMatrix = normalize(normalMatrix * currentNormal);',
                '',
                '    // Facing-based opacity: fades lines curving away from camera',
                '    float facing = dot(nMatrix, viewDir);',
                '    float baseAlpha = smoothstep(-0.2, 0.2, facing);',
                '',
                '    // Semi-transparency: back-facing lines get 25% of max opacity',
                '    float backOpacity = maxOpacity * 0.25;',
                '    vAlpha = mix(mix(backOpacity, maxOpacity, baseAlpha), maxOpacity, morphT);',
                '',
                '    gl_Position = projectionMatrix * mvPosition;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 color;',
                'uniform float uDimFactor;',
                'varying float vAlpha;',
                'void main() {',
                '    gl_FragColor = vec4(color, vAlpha * uDimFactor);',
                '}'
            ].join('\n'),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.morphMaterials.push(mat);
        return mat;
    };

    // Creates a morphable line from lat/lon coordinates
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
        this.globeGroup.add(line);
        return line;
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
                uGlobeRadius: { value: R * 1.02 },
                uFade: { value: 1.0 }
            },
            vertexShader: [
                'attribute float size;',
                'uniform float uPixelRatio;',
                'uniform vec3 uGlobeCenter;',
                'uniform float uGlobeRadius;',
                'uniform float uFade;',
                'varying float vBrightness;',
                'varying float vOcclusion;',
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
                '    } else {',
                '        vOcclusion = 1.0;',
                '    }',
                '    vOcclusion *= uFade;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying float vBrightness;',
                'varying float vOcclusion;',
                'void main() {',
                '    float d = length(gl_PointCoord - 0.5) * 2.0;',
                '    float alpha = smoothstep(1.0, 0.3, d) * vBrightness * 0.4 * vOcclusion;',
                '    gl_FragColor = vec4(0.7, 0.85, 0.95, alpha);',
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

        // 1) Inner dark sphere for depth effect (semi-transparent)
        var innerGeo = new THREE.SphereGeometry(R - 0.03, 64, 64);
        var innerMat = new THREE.MeshBasicMaterial({
            color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false
        });
        this.innerSphere = new THREE.Mesh(innerGeo, innerMat);
        gg.add(this.innerSphere);

        // 2) Continent fills via canvas texture mapped to sphere + plane
        this._buildContinentFills();

        // 3) Morphable vector outlines (from GeoJSON or LAND_DATA fallback)
        this.vectorMaterial = this.createMorphShaderMaterial(0.7, 0x40c0d0);
        this.countryMaterial = this.createMorphShaderMaterial(0.18, 0x279daf);
        this.graticuleMaterial = this.createMorphShaderMaterial(0.12, 0x1a8898);

        this._buildGraticule();

        if (this.geoJsonData) {
            this._buildGeoJSONVectors(this.geoJsonData);
        } else {
            this._buildLandDataVectors();
        }

        // 4) Atmospheric glow
        var glowMat = new THREE.ShaderMaterial({
            uniforms: {
                glowColor: { value: new THREE.Color(0x279daf) },
                viewVector: { value: this.camera.position },
                morphT: { value: 0.0 }
            },
            vertexShader: [
                'uniform vec3 viewVector;',
                'uniform float morphT;',
                'varying float intensity;',
                'void main() {',
                '    vec3 vN = normalize(normalMatrix * normal);',
                '    vec3 vV = normalize(normalMatrix * viewVector);',
                '    intensity = pow(0.55 - dot(vN, vV), 3.0);',
                '    intensity *= (1.0 - morphT);',
                '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 glowColor;',
                'varying float intensity;',
                'void main() {',
                '    gl_FragColor = vec4(glowColor * intensity, intensity * 0.3);',
                '}'
            ].join('\n'),
            side: THREE.FrontSide, blending: THREE.AdditiveBlending,
            transparent: true, depthWrite: false
        });
        this._glowMat = glowMat;
        gg.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 64, 64), glowMat));
    };

    CommunityGlobe.prototype._buildContinentFills = function() {
        var canvas = document.createElement('canvas');
        canvas.width = 4096; canvas.height = 2048;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        function mapPointToCanvas(lon, lat) {
            return {
                x: (lon + 180) * (canvas.width / 360),
                y: (90 - lat) * (canvas.height / 180)
            };
        }

        // Use GeoJSON if available for better fill quality
        if (this.geoJsonData) {
            ctx.fillStyle = 'rgba(39, 157, 175, 0.15)';
            this.geoJsonData.features.forEach(function(feature) {
                var processPolygon = function(coordinates) {
                    ctx.beginPath();
                    coordinates.forEach(function(ring) {
                        ring.forEach(function(coord, i) {
                            var pt = mapPointToCanvas(coord[0], coord[1]);
                            if (i === 0) ctx.moveTo(pt.x, pt.y);
                            else ctx.lineTo(pt.x, pt.y);
                        });
                    });
                    ctx.closePath();
                    ctx.fill('evenodd');
                };
                if (feature.geometry.type === 'Polygon') processPolygon(feature.geometry.coordinates);
                else if (feature.geometry.type === 'MultiPolygon') {
                    feature.geometry.coordinates.forEach(function(poly) { processPolygon(poly); });
                }
            });
        } else {
            ctx.fillStyle = 'rgba(39, 157, 175, 1.0)';
            this.LAND.forEach(function(polygon) {
                ctx.beginPath();
                polygon.forEach(function(coord, i) {
                    var x = ((coord[0] + 180) / 360) * canvas.width;
                    var y = ((90 - coord[1]) / 180) * canvas.height;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                ctx.closePath(); ctx.fill();
            });
        }

        var fillTex = new THREE.CanvasTexture(canvas);
        fillTex.minFilter = THREE.LinearFilter;

        // 3D Sphere fill (semi-transparent with see-through on back)
        var sphereGeo = new THREE.SphereGeometry(R - 0.01, 64, 64);
        var sphereMat = new THREE.MeshBasicMaterial({
            map: fillTex, transparent: true, opacity: 1.0,
            blending: THREE.NormalBlending, depthWrite: false
        });
        this.sphereFillMesh = new THREE.Mesh(sphereGeo, sphereMat);
        this.globeGroup.add(this.sphereFillMesh);

        // 2D Plane fill (hidden initially, positioned behind lines to avoid z-fighting)
        var planeGeo = new THREE.PlaneGeometry(2 * PI * R, PI * R);
        var planeMat = new THREE.MeshBasicMaterial({
            map: fillTex, transparent: true, opacity: 0,
            blending: THREE.NormalBlending, depthWrite: false
        });
        this.planeFillMesh = new THREE.Mesh(planeGeo, planeMat);
        this.planeFillMesh.position.z = -0.5;
        this.globeGroup.add(this.planeFillMesh);
    };

    CommunityGlobe.prototype._buildGraticule = function() {
        var lat, lon, points;
        // Latitude lines
        for (lat = -80; lat <= 80; lat += 10) {
            points = [];
            for (lon = -180; lon <= 180; lon += 3) points.push({ lat: lat, lon: lon });
            this.createMorphableLine(points, this.graticuleMaterial);
        }
        // Longitude lines
        for (lon = -180; lon <= 180; lon += 10) {
            points = [];
            for (lat = -90; lat <= 90; lat += 3) points.push({ lat: lat, lon: lon });
            this.createMorphableLine(points, this.graticuleMaterial);
        }
    };

    CommunityGlobe.prototype._buildGeoJSONVectors = function(geoJson) {
        var self = this;
        geoJson.features.forEach(function(feature) {
            var processRing = function(coordinates, material) {
                var points = [];
                for (var i = 0; i < coordinates.length; i++) {
                    var lon = coordinates[i][0];
                    var lat = coordinates[i][1];
                    // Break line at antimeridian
                    if (i > 0 && Math.abs(lon - coordinates[i - 1][0]) > 180) {
                        if (points.length > 1) self.createMorphableLine(points, material);
                        points = [];
                    }
                    points.push({ lat: lat, lon: lon });
                }
                if (points.length > 1) self.createMorphableLine(points, material);
            };

            if (feature.geometry.type === 'Polygon') {
                // First ring is outer boundary (continent line), rest are holes
                feature.geometry.coordinates.forEach(function(ring, idx) {
                    processRing(ring, idx === 0 ? self.vectorMaterial : self.countryMaterial);
                });
            } else if (feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates.forEach(function(poly) {
                    poly.forEach(function(ring, idx) {
                        processRing(ring, idx === 0 ? self.vectorMaterial : self.countryMaterial);
                    });
                });
            }

            // Country borders: draw all outer rings with the faint country material too
            // This gives each country a visible boundary, but fainter than the coastlines
            if (feature.geometry.type === 'Polygon') {
                processRing(feature.geometry.coordinates[0], self.countryMaterial);
            } else if (feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates.forEach(function(poly) {
                    processRing(poly[0], self.countryMaterial);
                });
            }
        });
    };

    CommunityGlobe.prototype._buildLandDataVectors = function() {
        var self = this;
        this.LAND.forEach(function(polygon) {
            var points = polygon.map(function(c) { return { lat: c[1], lon: c[0] }; });
            if (points.length > 1) self.createMorphableLine(points, self.vectorMaterial);
        });
    };

    // =========================================================================
    // MORPHABLE MARKER MATERIAL
    // Shader that supports both morphing position and facing-based dim
    // =========================================================================
    function createMarkerMorphMat(color, opacity) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(color) },
                uOpacity: { value: opacity },
                uDimFactor: { value: 1.0 },
                morphT: { value: 0.0 }
            },
            vertexShader: [
                'uniform float morphT;',
                'varying vec3 vWorldPos;',
                'void main() {',
                '    vec4 wp = modelMatrix * vec4(position, 1.0);',
                '    vWorldPos = wp.xyz;',
                '    gl_Position = projectionMatrix * viewMatrix * wp;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 uColor;',
                'uniform float uOpacity;',
                'uniform float uDimFactor;',
                'uniform float morphT;',
                'varying vec3 vWorldPos;',
                'void main() {',
                '    vec3 n = normalize(vWorldPos);',
                '    vec3 v = normalize(cameraPosition - vWorldPos);',
                '    float f = dot(n, v);',
                '    // In 3D: front/back fading. In 2D: everything visible',
                '    float fade3D = f > 0.0 ? 1.0 : 0.25;',
                '    fade3D *= smoothstep(-1.0, 0.1, f);',
                '    float fade = mix(fade3D, 1.0, morphT);',
                '    gl_FragColor = vec4(uColor, uOpacity * fade * uDimFactor);',
                '}',
            ].join('\n'),
            transparent: true, depthWrite: false, side: THREE.DoubleSide
        });
    }

    // =========================================================================
    // PROFILE MARKERS (with morphing support)
    // =========================================================================
    CommunityGlobe.prototype.buildProfileMarkers = function() {
        var self = this;
        var gg = this.globeGroup;

        this.people.forEach(function(person, idx) {
            var pos3D = latLonToVec3(person.lat, person.lon, R * 1.005);
            var pos2D = latLonToFlat(person.lat, person.lon, R);
            pos2D.z = 0.05;
            var mats = [];
            var markerGroup = new THREE.Group();

            // Ring
            var ringMat = createMarkerMorphMat(0xffbb00, 0.6);
            mats.push(ringMat);
            var ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 32), ringMat);
            markerGroup.add(ring);

            // Dot
            var dotMat = createMarkerMorphMat(0xffffff, 0.95);
            mats.push(dotMat);
            var dot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), dotMat);
            markerGroup.add(dot);

            // Pulse ring
            var pulseMat = createMarkerMorphMat(0xffbb00, 0.5);
            mats.push(pulseMat);
            var pulse = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.06, 32), pulseMat);
            markerGroup.add(pulse);

            // Beam
            var beamEnd3D = latLonToVec3(person.lat, person.lon, R * 1.15);
            var beamEnd2D = pos2D.clone(); beamEnd2D.z = 0.3;
            var beamGeo = new THREE.BufferGeometry().setFromPoints([pos3D.clone(), beamEnd3D]);
            var beamMat = createMarkerMorphMat(0xffbb00, 0.4);
            mats.push(beamMat);
            var beam = new THREE.Line(beamGeo, beamMat);
            markerGroup.add(beam);

            // Align ring and pulse to face outward
            markerGroup.position.copy(pos3D);
            ring.lookAt(pos3D.clone().multiplyScalar(2));
            pulse.lookAt(pos3D.clone().multiplyScalar(2));

            // Store 3D and 2D orientations for morphing
            var quat3D = ring.quaternion.clone();
            var dummy = new THREE.Object3D();
            dummy.position.copy(pos2D);
            dummy.lookAt(new THREE.Vector3(pos2D.x, pos2D.y, pos2D.z + 100));
            var quat2D = dummy.quaternion.clone();

            gg.add(markerGroup);

            // Hitbox
            var hitbox = new THREE.Mesh(
                new THREE.SphereGeometry(0.18, 16, 16),
                new THREE.MeshBasicMaterial({ visible: false })
            );
            hitbox.position.copy(pos3D);
            hitbox.userData = { personIndex: idx };
            gg.add(hitbox);

            self.markersList.push({
                group: markerGroup,
                ring: ring, dot: dot, pulse: pulse, beam: beam,
                hitbox: hitbox,
                mats: mats,
                pos3D: pos3D, pos2D: pos2D,
                quat3D: quat3D, quat2D: quat2D,
                beamEnd3D: beamEnd3D, beamEnd2D: beamEnd2D,
                pulsePhase: Math.random() * PI * 2
            });
            self.profileMaterials.push(mats);
        });
    };

    // =========================================================================
    // HOLON MARKERS
    // =========================================================================
    CommunityGlobe.prototype.buildHolonMarkers = function() {
        var self = this;
        var gg = this.globeGroup;

        this.holons.forEach(function(holon, hIdx) {
            var pos3D = latLonToVec3(holon.lat, holon.lon, R * 1.035);
            var pos2D = latLonToFlat(holon.lat, holon.lon, R);
            pos2D.z = 0.08;
            var hMats = [];
            var markerGroup = new THREE.Group();

            // Hex ring
            var hRingMat = createMarkerMorphMat(0x279daf, 0.7);
            hMats.push(hRingMat);
            var ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.15, 6), hRingMat);
            markerGroup.add(ring);

            // Center dot
            var hDotMat = createMarkerMorphMat(0x279daf, 0.95);
            hMats.push(hDotMat);
            var dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), hDotMat);
            markerGroup.add(dot);

            // Pulse
            var hPulseMat = createMarkerMorphMat(0x279daf, 0.5);
            hMats.push(hPulseMat);
            var pulse = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.07, 6), hPulseMat);
            markerGroup.add(pulse);

            markerGroup.position.copy(pos3D);
            ring.lookAt(pos3D.clone().multiplyScalar(2));
            pulse.lookAt(pos3D.clone().multiplyScalar(2));

            var quat3D = ring.quaternion.clone();
            var dummyH = new THREE.Object3D();
            dummyH.position.copy(pos2D);
            dummyH.lookAt(new THREE.Vector3(pos2D.x, pos2D.y, pos2D.z + 100));
            var quat2D = dummyH.quaternion.clone();

            gg.add(markerGroup);

            // Connection lines to members
            holon.memberIndices.forEach(function(pIdx) {
                var m = self.people[pIdx];
                if (!m) return;
                var mPos3D = latLonToVec3(m.lat, m.lon, R);
                var mPos2D = latLonToFlat(m.lat, m.lon, R);

                // Build arc path on sphere for 3D
                var holonDir = latLonToVec3(holon.lat, holon.lon, R).normalize();
                var mDir = mPos3D.clone().normalize();
                var ang = Math.acos(Math.min(1, Math.max(-1, holonDir.dot(mDir))));
                var sinAng = Math.sin(ang);
                var segments = 40;
                var arcPositions = new Float32Array((segments + 1) * 3);
                var arcPos2Ds = new Float32Array((segments + 1) * 3);

                for (var i = 0; i <= segments; i++) {
                    var t = i / segments;
                    var dir;
                    if (sinAng < 0.001) {
                        dir = new THREE.Vector3().lerpVectors(holonDir, mDir, t).normalize();
                    } else {
                        var a = Math.sin((1 - t) * ang) / sinAng;
                        var b = Math.sin(t * ang) / sinAng;
                        dir = new THREE.Vector3(
                            a * holonDir.x + b * mDir.x,
                            a * holonDir.y + b * mDir.y,
                            a * holonDir.z + b * mDir.z
                        ).normalize();
                    }
                    var startAlt = R * 1.035;
                    var endAlt = R * 1.005;
                    var baseAlt = startAlt + (endAlt - startAlt) * t;
                    var bow = Math.sin(t * PI) * 0.015 * R;
                    var pt3D = dir.clone().multiplyScalar(baseAlt + bow);

                    // 2D: straight line between positions
                    var pt2D = new THREE.Vector3(
                        pos2D.x + (mPos2D.x - pos2D.x) * t,
                        pos2D.y + (mPos2D.y - pos2D.y) * t,
                        0.02
                    );

                    arcPositions[i * 3] = pt3D.x; arcPositions[i * 3 + 1] = pt3D.y; arcPositions[i * 3 + 2] = pt3D.z;
                    arcPos2Ds[i * 3] = pt2D.x; arcPos2Ds[i * 3 + 1] = pt2D.y; arcPos2Ds[i * 3 + 2] = pt2D.z;
                }

                var arcGeo = new THREE.BufferGeometry();
                arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
                arcGeo.setAttribute('pos2D', new THREE.BufferAttribute(arcPos2Ds, 3));

                var arcMat = self.createMorphShaderMaterial(0.45, 0x279daf);
                arcMat.uniforms.uDimFactor = { value: 1.0 };
                hMats.push(arcMat);
                var arcLine = new THREE.Line(arcGeo, arcMat);
                gg.add(arcLine);
                self.connectionLines.push(arcLine);
            });

            // Hitbox
            var hitbox = new THREE.Mesh(
                new THREE.SphereGeometry(0.2, 16, 16),
                new THREE.MeshBasicMaterial({ visible: false })
            );
            hitbox.position.copy(pos3D);
            hitbox.userData = { holonIndex: hIdx };
            gg.add(hitbox);

            self.holonMarkersList.push({
                group: markerGroup,
                ring: ring, dot: dot, pulse: pulse,
                hitbox: hitbox,
                mats: hMats,
                pos3D: pos3D, pos2D: pos2D,
                quat3D: quat3D, quat2D: quat2D,
                pulsePhase: Math.random() * PI * 2
            });
            self.holonMaterials.push(hMats);
        });
    };

    // =========================================================================
    // GREAT CIRCLE ARCS (between holon members)
    // =========================================================================
    CommunityGlobe.prototype.buildGreatCircleArcs = function() {
        var self = this;
        var gg = this.globeGroup;
        var people = this.people;

        this.holons.forEach(function(holon) {
            var mi = holon.memberIndices;
            for (var i = 0; i < mi.length - 1; i++) {
                var a = people[mi[i]], b = people[mi[i + 1]];
                if (!a || !b) continue;

                var p1 = latLonToVec3(a.lat, a.lon, R);
                var p2 = latLonToVec3(b.lat, b.lon, R);
                var f1 = latLonToFlat(a.lat, a.lon, R);
                var f2 = latLonToFlat(b.lat, b.lon, R);

                var d = p1.clone().normalize().dot(p2.clone().normalize());
                var ang = Math.acos(Math.min(1, Math.max(-1, d)));
                var hScale = 0.12 * (ang / (PI / 2));
                var segments = 60;

                var arcPositions = new Float32Array((segments + 1) * 3);
                var arcPos2Ds = new Float32Array((segments + 1) * 3);

                for (var j = 0; j <= segments; j++) {
                    var t = j / segments;
                    var sinT = Math.sin(ang);
                    var pt;
                    if (sinT < 0.001) {
                        pt = new THREE.Vector3().lerpVectors(p1, p2, t);
                    } else {
                        var ca = Math.sin((1 - t) * ang) / sinT;
                        var cb = Math.sin(t * ang) / sinT;
                        pt = new THREE.Vector3(ca * p1.x + cb * p2.x, ca * p1.y + cb * p2.y, ca * p1.z + cb * p2.z);
                    }
                    pt.normalize().multiplyScalar(R * 1.005 + Math.sin(t * PI) * hScale * R);

                    // 2D: simple curved arc
                    var fx = f1.x + (f2.x - f1.x) * t;
                    var fy = f1.y + (f2.y - f1.y) * t;
                    var dist2D = Math.sqrt(Math.pow(f2.x - f1.x, 2) + Math.pow(f2.y - f1.y, 2));
                    var arc2D = Math.sin(t * PI) * dist2D * 0.08;

                    arcPositions[j * 3] = pt.x; arcPositions[j * 3 + 1] = pt.y; arcPositions[j * 3 + 2] = pt.z;
                    arcPos2Ds[j * 3] = fx; arcPos2Ds[j * 3 + 1] = fy + arc2D; arcPos2Ds[j * 3 + 2] = 0.01;
                }

                var arcGeo = new THREE.BufferGeometry();
                arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
                arcGeo.setAttribute('pos2D', new THREE.BufferAttribute(arcPos2Ds, 3));

                var arcMat = self.createMorphShaderMaterial(0.25, 0xffbb00);
                var line = new THREE.Line(arcGeo, arcMat);
                gg.add(line);
                self.arcLines.push(line);
            }
        });
    };

    // =========================================================================
    // VIEW TOGGLE (Gemini-style staged morph)
    // =========================================================================
    CommunityGlobe.prototype.toggleView = function() {
        this.is2DMode = !this.is2DMode;

        var track = this.container.querySelector('#cg-toggle-track');
        var lblG = this.container.querySelector('#cg-lbl-globe');
        var lblF = this.container.querySelector('#cg-lbl-flat');
        if (track) track.classList.toggle('flat', this.is2DMode);
        if (lblG) lblG.classList.toggle('active', !this.is2DMode);
        if (lblF) lblF.classList.toggle('active', this.is2DMode);

        if (this.is2DMode) {
            // Save current orbit position to restore later
            this._saved3DPosition = this.camera.position.clone();
            this._saved3DTarget = this.controls.target.clone();

            // Disable orbit controls during transition
            this.controls.enableRotate = false;
            this.controls.enablePan = false;
            this.controls.enableZoom = false;
            this.controls.autoRotate = false;

            this.isPreparing2D = true;
            this.morphDir = 0; // Wait until camera is aligned
        } else {
            // Restore 3D controls
            this.controls.enableRotate = true;
            this.controls.enablePan = false;
            this.controls.enableZoom = true;
            this.controls.autoRotate = true;

            this.isPreparing2D = false;
            this.morphDir = -1;
        }
    };

    // =========================================================================
    // PROFILE CARD (same as V1)
    // =========================================================================
    CommunityGlobe.prototype.showProfileCard = function(index, screenX, screenY, isHolon) {
        var data = isHolon ? this.holons[index] : this.people[index];
        if (!data) return;

        var bannerEl = this.container.querySelector('#cg-banner');
        var bannerUrl = data.banner_url || '';
        if (bannerUrl) {
            bannerEl.innerHTML = '<img src="' + bannerUrl + '" alt="">';
            bannerEl.style.display = 'block';
        } else {
            bannerEl.innerHTML = '';
            bannerEl.style.display = 'none';
        }

        var avatarEl = this.container.querySelector('#cg-avatar');
        if (isHolon) {
            if (data.image_url) {
                avatarEl.innerHTML = '<img src="' + data.image_url + '" alt="">';
            } else {
                avatarEl.innerHTML = '';
                avatarEl.textContent = data.initials;
            }
            avatarEl.style.background = data.image_url ? 'transparent' : 'linear-gradient(135deg, #1a6a78, #279daf)';
            avatarEl.style.borderRadius = '8px';
        } else {
            if (data.avatar_url) {
                avatarEl.innerHTML = '<img src="' + data.avatar_url + '" alt="">';
                avatarEl.style.background = 'transparent';
            } else {
                avatarEl.innerHTML = '';
                avatarEl.textContent = data.initials;
                avatarEl.style.background = 'linear-gradient(135deg, #b8860b, #ffbb00)';
            }
            avatarEl.style.borderRadius = '50%';
        }

        this.container.querySelector('#cg-name').textContent = data.name;
        this.container.querySelector('#cg-role').textContent = isHolon ? data.type : data.role;
        this.container.querySelector('#cg-location').textContent = isHolon
            ? data.memberIndices.length + ' Members' : data.location;
        this.container.querySelector('#cg-bio').textContent = isHolon
            ? (data.description.length > 150 ? data.description.substring(0, 150) + '...' : data.description)
            : (data.bio.length > 150 ? data.bio.substring(0, 150) + '...' : data.bio);

        var tagsEl = this.container.querySelector('#cg-tags');
        tagsEl.innerHTML = '';
        (data.categories || []).forEach(function(cat) {
            var span = document.createElement('span');
            span.className = 'pc-cat'; span.textContent = cat;
            tagsEl.appendChild(span);
        });
        (data.tags || []).forEach(function(tag) {
            var span = document.createElement('span');
            span.className = 'pc-tag';
            if (isHolon) {
                span.style.color = '#50bcc8';
                span.style.borderColor = 'rgba(39,157,175,0.25)';
                span.style.background = 'rgba(39,157,175,0.1)';
            }
            span.textContent = tag;
            tagsEl.appendChild(span);
        });

        var linkEl = this.container.querySelector('#cg-link');
        if (isHolon) {
            linkEl.textContent = 'View Holon';
            linkEl.href = '/holon?h=' + encodeURIComponent(data.slug || data.id);
        } else {
            linkEl.textContent = 'View Profile';
            linkEl.href = '/member?u=' + encodeURIComponent(data.slug || data.id);
        }

        var rect = this.container.getBoundingClientRect();
        var cardW = 260, cardH = 240;
        var left = screenX - rect.left + 20;
        var top = screenY - rect.top - cardH / 2;
        if (left + cardW > rect.width - 16) left = screenX - rect.left - cardW - 20;
        if (top < 16) top = 16;
        if (top + cardH > rect.height - 16) top = rect.height - cardH - 16;
        this.profileCard.style.left = left + 'px';
        this.profileCard.style.top = top + 'px';
        this.profileCard.classList.add('visible');

        this.activePersonIndex = index;
        this.activeIsHolon = isHolon;
        if (isHolon) this.highlightHolon(index);
        else this.highlightProfile(index);
        if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
    };

    CommunityGlobe.prototype.hideProfileCard = function() {
        var self = this;
        this.hideTimeout = setTimeout(function() {
            self.profileCard.classList.remove('visible');
            self.activePersonIndex = -1;
            self.resetHighlight();
        }, 150);
    };

    CommunityGlobe.prototype.handleMarkerClick = function(e) {
        var rect = this.container.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        var raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mx, my), this.camera);

        var allHitboxes = this.markersList.map(function(m) { return m.hitbox; })
            .concat(this.holonMarkersList.map(function(m) { return m.hitbox; }));
        var intersects = raycaster.intersectObjects(allHitboxes);

        if (intersects.length > 0) {
            var hit = intersects[0].object;
            // Skip markers on back of globe in 3D mode
            if (this.morphTime < 0.5) {
                var markerPos = hit.position.clone();
                var normal = markerPos.clone().normalize();
                var viewDir = this.camera.position.clone().sub(markerPos).normalize();
                if (normal.dot(viewDir) < 0.05) return;
            }
            var isHolon = hit.userData.holonIndex !== undefined;
            var data = isHolon ? this.holons[hit.userData.holonIndex] : this.people[hit.userData.personIndex];
            if (data && data.slug) {
                var url = isHolon
                    ? '/holon?h=' + encodeURIComponent(data.slug)
                    : '/member?u=' + encodeURIComponent(data.slug);
                window.open(url, '_blank');
            }
        }
    };

    // =========================================================================
    // HIGHLIGHT / DIM
    // =========================================================================
    CommunityGlobe.prototype.setAllDimTargets = function(val) {
        this.profileDimTargets.fill(val);
        this.holonDimTargets.fill(val);
    };

    CommunityGlobe.prototype.highlightHolon = function(hIdx) {
        this.setAllDimTargets(0.15);
        this.holonDimTargets[hIdx] = 1.5;
        var self = this;
        this.holons[hIdx].memberIndices.forEach(function(pIdx) { self.profileDimTargets[pIdx] = 1.0; });
    };

    CommunityGlobe.prototype.highlightProfile = function(pIdx) {
        this.setAllDimTargets(0.15);
        this.profileDimTargets[pIdx] = 1.0;
        var self = this;
        this.holons.forEach(function(h, hIdx) {
            if (h.memberIndices.indexOf(pIdx) !== -1) {
                self.holonDimTargets[hIdx] = 1.2;
                h.memberIndices.forEach(function(idx) {
                    self.profileDimTargets[idx] = Math.max(self.profileDimTargets[idx], 0.7);
                });
            }
        });
        this.profileDimTargets[pIdx] = 1.0;
    };

    CommunityGlobe.prototype.resetHighlight = function() {
        this.setAllDimTargets(1.0);
    };

    CommunityGlobe.prototype.updateDimFactors = function() {
        var speed = 0.1;
        this.profileMaterials.forEach(function(mats, pIdx) {
            var target = this.profileDimTargets[pIdx];
            mats.forEach(function(m) {
                if (m.uniforms && m.uniforms.uDimFactor) {
                    m.uniforms.uDimFactor.value += (target - m.uniforms.uDimFactor.value) * speed;
                }
            });
        }.bind(this));
        this.holonMaterials.forEach(function(mats, hIdx) {
            var target = this.holonDimTargets[hIdx];
            mats.forEach(function(m) {
                if (m.uniforms && m.uniforms.uDimFactor) {
                    m.uniforms.uDimFactor.value += (target - m.uniforms.uDimFactor.value) * speed;
                }
            });
        }.bind(this));
    };

    // =========================================================================
    // HOVER DETECTION
    // =========================================================================
    CommunityGlobe.prototype.checkMarkerHover = function(e) {
        var rect = this.container.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        var raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mx, my), this.camera);

        var allHitboxes = this.markersList.map(function(m) { return m.hitbox; })
            .concat(this.holonMarkersList.map(function(m) { return m.hitbox; }));
        var intersects = raycaster.intersectObjects(allHitboxes);

        if (intersects.length > 0) {
            var hit = intersects[0].object;
            var markerPos = hit.position.clone();

            var visible = true;
            if (this.morphTime < 0.5) {
                var normal = markerPos.clone().normalize();
                var viewDir = this.camera.position.clone().sub(markerPos).normalize();
                visible = normal.dot(viewDir) > 0.05;
            }

            if (visible) {
                var worldPos = this.globeGroup.localToWorld(markerPos.clone());
                var screenPos = worldPos.project(this.camera);
                var sx = (screenPos.x * 0.5 + 0.5) * rect.width + rect.left;
                var sy = (-screenPos.y * 0.5 + 0.5) * rect.height + rect.top;

                var isHolon = hit.userData.holonIndex !== undefined;
                var idx = isHolon ? hit.userData.holonIndex : hit.userData.personIndex;

                if (idx !== this.activePersonIndex || isHolon !== this.activeIsHolon) {
                    this.showProfileCard(idx, sx, sy, isHolon);
                }
                this.renderer.domElement.style.cursor = 'pointer';
                this.hoveringMarker = true;
                return;
            }
        }

        this.renderer.domElement.style.cursor = 'default';
        this.hoveringMarker = false;
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
    // ANIMATION LOOP (Gemini-inspired staged morph)
    // =========================================================================
    CommunityGlobe.prototype.animate = function() {
        if (this.animating) return;
        this.animating = true;
        var self = this;

        function loop() {
            requestAnimationFrame(loop);

            // --- PREPARATION PHASE: Orbit camera to front before morphing ---
            if (self.isPreparing2D) {
                var currentSpherical = new THREE.Spherical().setFromVector3(self.camera.position);

                var targetRadius = 22;
                var targetPhi = PI / 2;  // Equator level
                var targetTheta = 0;     // Front-facing

                var thetaDiff = targetTheta - currentSpherical.theta;
                thetaDiff = Math.atan2(Math.sin(thetaDiff), Math.cos(thetaDiff));

                var lerpSpeed = 0.06;
                currentSpherical.theta += thetaDiff * lerpSpeed;
                currentSpherical.phi += (targetPhi - currentSpherical.phi) * lerpSpeed;
                currentSpherical.radius += (targetRadius - currentSpherical.radius) * lerpSpeed;

                self.camera.position.setFromSpherical(currentSpherical);
                self.controls.target.lerp(new THREE.Vector3(0, 0, 0), lerpSpeed);

                // Rotate globe back to no-rotation alignment
                var targetQuat = new THREE.Quaternion(0, 0, 0, 1);
                self.globeGroup.quaternion.slerp(targetQuat, lerpSpeed);

                // Check if orbit has arrived
                if (Math.abs(currentSpherical.radius - targetRadius) < 0.5 &&
                    Math.abs(thetaDiff) < 0.03 &&
                    self.globeGroup.quaternion.angleTo(targetQuat) < 0.03) {

                    self.camera.position.set(0, 0, targetRadius);
                    self.globeGroup.quaternion.copy(targetQuat);

                    self.isPreparing2D = false;
                    self.morphDir = 1; // Start the actual morph

                    // Enable 2D controls
                    self.controls.enablePan = true;
                    self.controls.enableZoom = true;
                    self.controls.enableRotate = false;
                    self.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
                }
            }

            // --- STAGED MORPH ANIMATION ---
            if (self.morphDir !== 0) {
                self.morphTime += self.morphDir * 0.012;
                if (self.morphTime >= 1.0) { self.morphTime = 1.0; self.morphDir = 0; }
                if (self.morphTime <= 0.0) {
                    self.morphTime = 0.0;
                    self.morphDir = 0;
                    // Restore 3D orbit controls
                    self.controls.enableRotate = true;
                    self.controls.enablePan = false;
                    self.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
                    // Restore saved camera position
                    if (self._saved3DPosition) {
                        self.camera.position.copy(self._saved3DPosition);
                        self.controls.target.copy(self._saved3DTarget);
                    }
                }
            }

            // Timeline phases (Gemini-style):
            // 0.0 to 0.2  -> 3D solids (fills) fade out
            // 0.2 to 0.8  -> Vector lines & markers morph
            // 0.8 to 1.0  -> 2D solids (fills) fade in
            var mt = self.morphTime;
            var fadeOut3D = Math.max(0, 1.0 - (mt / 0.2));
            var morphProg = Math.max(0, Math.min(1, (mt - 0.2) / 0.6));
            var fadeIn2D = Math.max(0, (mt - 0.8) / 0.2);

            // Ease the morph progress for smoother animation
            var easedMorph = morphProg < 0.5
                ? 2 * morphProg * morphProg
                : 1 - Math.pow(-2 * morphProg + 2, 2) / 2;

            // Update all morphable shader materials
            self.morphMaterials.forEach(function(mat) {
                mat.uniforms.morphT.value = easedMorph;
            });

            // Update fills
            if (self.sphereFillMesh) self.sphereFillMesh.material.opacity = fadeOut3D;
            if (self.innerSphere) self.innerSphere.material.opacity = fadeOut3D * 0.5;
            if (self.planeFillMesh) self.planeFillMesh.material.opacity = fadeIn2D;

            // Glow fades with 3D
            if (self._glowMat) {
                self._glowMat.uniforms.morphT.value = mt;
                self._glowMat.uniforms.viewVector.value = self.camera.position;
            }

            // Stars fade out in 2D
            if (self.starMat) self.starMat.uniforms.uFade.value = 1.0 - mt;

            // Update markers: morph positions, orientations, and pulse
            var time = Date.now();
            self.markersList.forEach(function(m) {
                m.group.position.lerpVectors(m.pos3D, m.pos2D, easedMorph);
                m.ring.quaternion.slerpQuaternions(m.quat3D, m.quat2D, easedMorph);
                m.pulse.quaternion.slerpQuaternions(m.quat3D, m.quat2D, easedMorph);
                m.hitbox.position.lerpVectors(m.pos3D, m.pos2D, easedMorph);

                // Pulse animation
                var pt = ((time + m.pulsePhase * 1000) % 2000) / 2000;
                m.pulse.scale.setScalar(1 + pt * 3);
                if (m.mats[2] && m.mats[2].uniforms) {
                    m.mats[2].uniforms.uOpacity.value = 0.5 * (1 - pt);
                }

                // Update morphT on marker materials
                m.mats.forEach(function(mat) {
                    if (mat.uniforms && mat.uniforms.morphT) {
                        mat.uniforms.morphT.value = easedMorph;
                    }
                });

                // Facing-based fade for marker in 3D
                if (easedMorph < 1.0) {
                    var viewDir = new THREE.Vector3().subVectors(self.camera.position, m.group.position).normalize();
                    var normal = new THREE.Vector3().lerpVectors(
                        m.pos3D.clone().normalize(),
                        new THREE.Vector3(0, 0, 1),
                        easedMorph
                    ).normalize();
                    var dotProd = normal.dot(viewDir);
                    var baseAlpha = THREE.MathUtils.smoothstep(dotProd, -0.2, 0.2);
                    var facingAlpha = 0.25 + baseAlpha * 0.75;
                    facingAlpha = THREE.MathUtils.lerp(facingAlpha, 1.0, easedMorph);

                    m.mats.forEach(function(mat) {
                        if (mat.uniforms && mat.uniforms.uOpacity && mat._baseOp === undefined) {
                            mat._baseOp = mat.uniforms.uOpacity.value;
                        }
                        if (mat.uniforms && mat.uniforms.uOpacity && mat._baseOp !== undefined) {
                            // Don't override pulse mat
                            if (mat !== m.mats[2]) {
                                mat.uniforms.uOpacity.value = mat._baseOp * facingAlpha;
                            }
                        }
                    });
                }
            });

            // Holon markers
            self.holonMarkersList.forEach(function(m) {
                m.group.position.lerpVectors(m.pos3D, m.pos2D, easedMorph);
                m.ring.quaternion.slerpQuaternions(m.quat3D, m.quat2D, easedMorph);
                m.pulse.quaternion.slerpQuaternions(m.quat3D, m.quat2D, easedMorph);
                m.hitbox.position.lerpVectors(m.pos3D, m.pos2D, easedMorph);

                var pt = ((time + m.pulsePhase * 1000) % 2500) / 2500;
                m.pulse.scale.setScalar(1 + pt * 3.5);
                if (m.mats[2] && m.mats[2].uniforms) {
                    m.mats[2].uniforms.uOpacity.value = 0.5 * (1 - pt);
                }

                m.mats.forEach(function(mat) {
                    if (mat.uniforms && mat.uniforms.morphT) {
                        mat.uniforms.morphT.value = easedMorph;
                    }
                });
            });

            // Auto-rotate only in 3D mode when not morphing
            if (self.morphDir === 0 && !self.is2DMode && !self.isPreparing2D && mt === 0) {
                self.controls.autoRotate = !self.hoveringMarker;
            } else {
                self.controls.autoRotate = false;
            }

            // Keep globe centered during morph
            if (self.morphDir !== 0) {
                self.controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.06);
            } else if (self.is2DMode && !self.isPreparing2D) {
                self.globeGroup.quaternion.slerp(new THREE.Quaternion(0, 0, 0, 1), 0.1);
            }

            self.updateDimFactors();
            self.controls.update();
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

        cv.addEventListener('mousedown', function(e) {
            dragStart = { x: e.clientX, y: e.clientY };
        });

        cv.addEventListener('mousemove', function(e) {
            if (!dragStart) {
                self.checkMarkerHover(e);
            } else {
                // Hide card while dragging
                if (self.activePersonIndex >= 0) {
                    var dx = e.clientX - dragStart.x;
                    var dy = e.clientY - dragStart.y;
                    if (Math.sqrt(dx * dx + dy * dy) > 3) {
                        self.profileCard.classList.remove('visible');
                        self.activePersonIndex = -1;
                    }
                }
            }
            self.updateCoords(e);
        });

        cv.addEventListener('mouseup', function(e) {
            if (dragStart) {
                var dx = e.clientX - dragStart.x;
                var dy = e.clientY - dragStart.y;
                if (Math.sqrt(dx * dx + dy * dy) < 5) {
                    self.handleMarkerClick(e);
                }
                dragStart = null;
            }
        });

        cv.addEventListener('mouseleave', function() { dragStart = null; });

        // Resize
        window.addEventListener('resize', function() {
            var w = self.container.clientWidth;
            var h = self.container.clientHeight
                || (self.container.parentElement && self.container.parentElement.clientHeight)
                || window.innerHeight;
            self.camera.aspect = w / h;
            self.camera.updateProjectionMatrix();
            self.renderer.setSize(w, h);
        });
    };

    // Export
    window.CommunityGlobe = new CommunityGlobe();
})();
