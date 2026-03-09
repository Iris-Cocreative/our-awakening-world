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
        this.arcLines = [];
        this.connectionLines = [];
        // Interaction state
        this.hoveringMarker = false;
        this.activePersonIndex = -1;
        this.hideTimeout = null;
        // Materials arrays for dimming
        this.profileMaterials = [];
        this.profileDimTargets = [];
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

        console.log('[community-globe-v3] Data counts — profiles:', profiles.length);

        var profileTagsRes = await sb.from('profile_tags').select('profile_id, tags(id, name)');
        var profileTagsData = profileTagsRes.data || [];
        var profileCatsRes = await sb.from('profile_categories').select('profile_id, categories(id, name)');
        var profileCatsData = profileCatsRes.data || [];
        var profileCatsData = profileCatsRes.data || [];

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

        this.profileDimTargets = this.people.map(function() { return 1.0; });

        console.log('[community-globe-v3] Loaded', this.people.length, 'profiles');
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
        info.innerHTML = '<h1>Community Globe</h1><p>' + this.people.length + ' Members</p>';
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
                '    gl_FragColor = vec4(0.2, 0.3, 0.4, alpha);', // Dark stars instead of light stars
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
            color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false
        });
        this.innerSphere = new THREE.Mesh(innerGeo, innerMat);
        gg.add(this.innerSphere);

        // 2) Continent fills via canvas texture mapped to sphere + plane
        this._buildContinentFills();

        // 3) Morphable vector outlines (from GeoJSON or LAND_DATA fallback)
        this.vectorMaterial = this.createMorphShaderMaterial(0.3, 0x000000); // Darker outlines for light mode
        this.countryMaterial = this.createMorphShaderMaterial(0.1, 0x333333);
        this.graticuleMaterial = this.createMorphShaderMaterial(0.08, 0x888888);

        this._buildGraticule();

        if (this.geoJsonData) {
            this._buildGeoJSONVectors(this.geoJsonData);
        } else {
            this._buildLandDataVectors();
        }

        // 4) Atmospheric glow
        var glowMat = new THREE.ShaderMaterial({
            uniforms: {
                glowColor: { value: new THREE.Color(0xffffff) }, // White atmospheric glow
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
                '    gl_FragColor = vec4(glowColor * intensity, intensity * 0.15);',
                '}'
            ].join('\n'),
            side: THREE.BackSide, blending: THREE.AdditiveBlending,
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

        var fillTex = new THREE.CanvasTexture(canvas);
        fillTex.minFilter = THREE.LinearFilter;
        
        var self = this;
        var imageObj = new Image();
        imageObj.crossOrigin = "Anonymous";
        imageObj.src = "./Iris_a_canvas_covered_in_paint_beautiful_abstract_art_thick_bru_9685ecde-4301-4db4-8f52-1df4ad378f65.png";
        
        imageObj.onload = function() {
            // First, draw the continent masks
            function mapPointToCanvas(lon, lat) {
                return {
                    x: (lon + 180) * (canvas.width / 360),
                    y: (90 - lat) * (canvas.height / 180)
                };
            }

            ctx.beginPath();
            if (self.geoJsonData) {
                self.geoJsonData.features.forEach(function(feature) {
                    var processPolygon = function(coordinates) {
                        coordinates.forEach(function(ring) {
                            ring.forEach(function(coord, i) {
                                var pt = mapPointToCanvas(coord[0], coord[1]);
                                if (i === 0) ctx.moveTo(pt.x, pt.y);
                                else ctx.lineTo(pt.x, pt.y);
                            });
                        });
                    };
                    if (feature.geometry.type === 'Polygon') processPolygon(feature.geometry.coordinates);
                    else if (feature.geometry.type === 'MultiPolygon') {
                        feature.geometry.coordinates.forEach(function(poly) { processPolygon(poly); });
                    }
                });
            } else {
                self.LAND.forEach(function(polygon) {
                    polygon.forEach(function(coord, i) {
                        var x = ((coord[0] + 180) / 360) * canvas.width;
                        var y = ((90 - coord[1]) / 180) * canvas.height;
                        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    });
                });
            }
            ctx.closePath();
            ctx.clip('evenodd');

            // Then draw the image into the clipped areas
            ctx.drawImage(imageObj, 0, 0, canvas.width, canvas.height);
            fillTex.needsUpdate = true;
        };

        var warpUniforms = {
            map: { value: fillTex },
            morphT: { value: 0.0 },
            uOpacity: { value: 1.0 }
        };
        var warpVert = [
            'uniform float morphT;',
            'varying vec2 vUv;',
            'const float PI = 3.14159265359;',
            'const float R = ' + (R - 0.01).toFixed(4) + ';',
            'void main() {',
            '    vUv = uv;',
            '    float lon = (position.x / (PI * R)) * 180.0;',
            '    float lat = (position.y / ((PI * R)/2.0)) * 90.0;',
            '    float phi = (90.0 - lat) * (PI / 180.0);',
            '    float theta = (lon + 180.0) * (PI / 180.0);',
            '    vec3 pos3D = vec3(',
            '        -(R * sin(phi) * cos(theta)),',
            '        R * cos(phi),',
            '        R * sin(phi) * sin(theta)',
            '    );',
            '    vec3 pos2D = vec3(position.x, position.y, -0.2); // slight offset back to prevent z-fighting flat lines',
            '    vec3 finalPos = mix(pos3D, pos2D, morphT);',
            '    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);',
            '}'
        ].join('\n');
        var warpFrag = [
            'uniform sampler2D map;',
            'uniform float uOpacity;',
            'varying vec2 vUv;',
            'void main() {',
            '    vec4 color = texture2D(map, vUv);',
            '    gl_FragColor = vec4(color.rgb, color.a * uOpacity);',
            '}'
        ].join('\n');
        var morphGeo = new THREE.PlaneGeometry(2 * PI * R, PI * R, 128, 64);
        var warpMat = new THREE.ShaderMaterial({
            uniforms: warpUniforms,
            vertexShader: warpVert,
            fragmentShader: warpFrag,
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false
        });
        this.sphereFillMesh = new THREE.Mesh(morphGeo, warpMat);
        this.globeGroup.add(this.sphereFillMesh);
        this.morphMaterials.push(warpMat);
        // Plane mesh removed as the sphere now morphs entirely into the plane
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
    // PROFILE MARKERS (as 3D Planes embedded on sphere)
    // =========================================================================
    CommunityGlobe.prototype.buildProfileMarkers = function() {
        var self = this;
        var gg = this.globeGroup;
        
        // We'll calculate an ideal plane size relative to the globe radius
        var planeWidth = R * 0.1;
        var planeHeight = R * 0.0625;

        this.people.forEach(function(person, idx) {
            // Position slightly above the surface to avoid z-fighting
            var pos3D = latLonToVec3(person.lat, person.lon, R * 1.01);
            var pos2D = latLonToFlat(person.lat, person.lon, R);
            pos2D.z = 0.05;
            
            var markerGroup = new THREE.Group();

            // 1) Render Card to Canvas
            var canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 320;
            var ctx = canvas.getContext('2d');
            
            // Draw card background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.beginPath();
            ctx.roundRect(0, 0, canvas.width, canvas.height, 24);
            ctx.fill();
            
            // Draw border
            ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
            ctx.lineWidth = 4;
            ctx.stroke();

            // Draw Avatar (Initials for now)
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(80, 80, 40, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 36px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(person.initials, 80, 80);

            // Draw Text Details
            ctx.fillStyle = '#111';
            ctx.textAlign = 'left';
            
            ctx.font = 'bold 32px sans-serif';
            ctx.fillText(person.name, 140, 60);
            
            ctx.font = '24px sans-serif';
            ctx.fillStyle = '#666';
            ctx.fillText(person.role || "Member", 140, 100);
            
            ctx.font = '20px sans-serif';
            ctx.fillStyle = '#888';
            ctx.fillText('📍 ' + (person.location || "Unknown"), 40, 160);
            
            // Tags
            var tagX = 40;
            var tagY = 220;
            ctx.font = '20px sans-serif';
            (person.tags || []).slice(0, 3).forEach(function(tag) {
                ctx.fillStyle = 'rgba(50, 50, 50, 0.1)';
                ctx.beginPath();
                ctx.roundRect(tagX, tagY - 24, ctx.measureText(tag).width + 20, 36, 18);
                ctx.fill();
                
                ctx.fillStyle = '#333';
                ctx.fillText(tag, tagX + 10, tagY);
                tagX += ctx.measureText(tag).width + 30;
            });

            // 2) Create Texture & Material
            var tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;
            
            // We use a custom shader material to support the 3D to 2D morphing
            var cardMat = new THREE.ShaderMaterial({
                uniforms: {
                    uMap: { value: tex },
                    uOpacity: { value: 1.0 },
                    uDimFactor: { value: 1.0 },
                    morphT: { value: 0.0 }
                },
                vertexShader: [
                    'uniform float morphT;',
                    'varying vec2 vUv;',
                    'varying vec3 vWorldPos;',
                    'void main() {',
                    '    vUv = uv;',
                    '    vec4 wp = modelMatrix * vec4(position, 1.0);',
                    '    vWorldPos = wp.xyz;',
                    '    gl_Position = projectionMatrix * viewMatrix * wp;',
                    '}'
                ].join('\n'),
                fragmentShader: [
                    'uniform sampler2D uMap;',
                    'uniform float uOpacity;',
                    'uniform float uDimFactor;',
                    'uniform float morphT;',
                    'varying vec2 vUv;',
                    'varying vec3 vWorldPos;',
                    'void main() {',
                    '    vec4 texColor = texture2D(uMap, vUv);',
                    '    // Backface culling/fading in 3D',
                    '    vec3 n = normalize(vWorldPos);',
                    '    vec3 v = normalize(cameraPosition - vWorldPos);',
                    '    float f = dot(n, v);',
                    '    float fade3D = f > 0.1 ? 1.0 : 0.0;',
                    '    float fade = mix(fade3D, 1.0, morphT);',
                    '    // Only render if within card bounds (rounded corners via alpha in tex)',
                    '    gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity * fade * uDimFactor);',
                    '}',
                ].join('\n'),
                transparent: true, depthWrite: false, side: THREE.DoubleSide
            });

            // 3) Create Mesh
            var plane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), cardMat);
            markerGroup.add(plane);

            // 4) Orientation
            markerGroup.position.copy(pos3D);
            // Look directly away from the center of the sphere
            var lookTarget = pos3D.clone().multiplyScalar(2);
            plane.lookAt(lookTarget);

            // Store quaternions for morphing
            var quat3D = plane.quaternion.clone();
            
            var dummy = new THREE.Object3D();
            dummy.position.copy(pos2D);
            dummy.lookAt(new THREE.Vector3(pos2D.x, pos2D.y, pos2D.z + 100));
            var quat2D = dummy.quaternion.clone();

            gg.add(markerGroup);

            // Hitbox (scaled slightly larger than card)
            var hitbox = new THREE.Mesh(
                new THREE.PlaneGeometry(planeWidth * 1.2, planeHeight * 1.2),
                new THREE.MeshBasicMaterial({ visible: false })
            );
            hitbox.position.copy(pos3D);
            hitbox.lookAt(lookTarget);
            hitbox.userData = { personIndex: idx };
            gg.add(hitbox);

            var mats = [cardMat];

            self.markersList.push({
                group: markerGroup,
                plane: plane, // Reference to just the plane
                ring: plane,  // Re-use ring/pulse property names to avoid breaking animate loop mapping
                pulse: plane,
                hitbox: hitbox,
                mats: mats,
                pos3D: pos3D, pos2D: pos2D,
                quat3D: quat3D, quat2D: quat2D,
                pulsePhase: 0 // Remove pulsing behaviour 
            });
            self.profileMaterials.push(mats);
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
    CommunityGlobe.prototype.showProfileCard = function(index, screenX, screenY) {
        var data = this.people[index];
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
        if (data.avatar_url) {
            avatarEl.innerHTML = '<img src="' + data.avatar_url + '" alt="">';
            avatarEl.style.background = 'transparent';
        } else {
            avatarEl.innerHTML = '';
            avatarEl.textContent = data.initials;
            avatarEl.style.background = 'linear-gradient(135deg, #b8860b, #ffbb00)';
        }
        avatarEl.style.borderRadius = '50%';

        this.container.querySelector('#cg-name').textContent = data.name;
        this.container.querySelector('#cg-role').textContent = data.role;
        this.container.querySelector('#cg-location').textContent = data.location;
        this.container.querySelector('#cg-bio').textContent = (data.bio.length > 150 ? data.bio.substring(0, 150) + '...' : data.bio);

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
            span.textContent = tag;
            tagsEl.appendChild(span);
        });

        var linkEl = this.container.querySelector('#cg-link');
        linkEl.textContent = 'View Profile';
        linkEl.href = '/member?u=' + encodeURIComponent(data.slug || data.id);

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
        this.highlightProfile(index);
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

        var allHitboxes = this.markersList.map(function(m) { return m.hitbox; });
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
            var data = this.people[hit.userData.personIndex];
            if (data && data.slug) {
                var url = '/member?u=' + encodeURIComponent(data.slug);
                window.open(url, '_blank');
            }
        }
    };

    // =========================================================================
    // HIGHLIGHT / DIM
    // =========================================================================
    CommunityGlobe.prototype.setAllDimTargets = function(val) {
        this.profileDimTargets.fill(val);
    };

    CommunityGlobe.prototype.highlightProfile = function(pIdx) {
        this.setAllDimTargets(0.15);
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

        var allHitboxes = this.markersList.map(function(m) { return m.hitbox; });
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

                var idx = hit.userData.personIndex;

                if (idx !== this.activePersonIndex) {
                    this.showProfileCard(idx, sx, sy);
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
            if (self.innerSphere) self.innerSphere.material.opacity = fadeOut3D * 0.5;

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

                // Pulse animation removed (keeping plain rotation and positioning)

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
