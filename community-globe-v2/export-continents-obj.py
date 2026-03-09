"""
Export continent geometry from GeoJSON as a .obj file (spherical projection).
Uses the same GeoJSON source and projection math as community-globe-v3.1.js.

Output: continents-sphere.obj
"""

import json
import math
import urllib.request
import sys

# Same constants as the globe
R = 6.371
GEOJSON_URL = 'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson'

PI = math.pi


def lat_lon_to_vec3(lat, lon, r=R):
    """Same projection as latLonToVec3() in community-globe-v3.1.js"""
    phi = (90 - lat) * PI / 180
    theta = (lon + 180) * PI / 180
    x = -r * math.sin(phi) * math.cos(theta)
    y = r * math.cos(phi)
    z = r * math.sin(phi) * math.sin(theta)
    return (x, y, z)


# ===========================================================================
# Earcut triangulation (pure Python port of mapbox/earcut)
# ===========================================================================

def earcut(data, hole_indices=None, dim=2):
    """Attempt polygon triangulation using ear-clipping. Returns list of triangle indices."""
    has_holes = hole_indices and len(hole_indices) > 0
    outer_len = hole_indices[0] * dim if has_holes else len(data)

    outer_node = linked_list(data, 0, outer_len, dim, True)
    triangles = []

    if not outer_node or outer_node.next == outer_node.prev:
        return triangles

    if has_holes:
        outer_node = eliminate_holes(data, hole_indices, outer_node, dim)

    min_x = min_y = float('inf')
    max_x = max_y = float('-inf')
    inv_size = 0

    # Index the outer polygon for z-order curve acceleration
    p = outer_node
    while True:
        x = p.x
        y = p.y
        if x < min_x: min_x = x
        if y < min_y: min_y = y
        if x > max_x: max_x = x
        if y > max_y: max_y = y
        p = p.next
        if p == outer_node:
            break

    inv_size = max(max_x - min_x, max_y - min_y)
    inv_size = 32767 / inv_size if inv_size != 0 else 0

    earcut_linked(outer_node, triangles, dim, min_x, min_y, inv_size, 0)
    return triangles


class Node:
    __slots__ = ['i', 'x', 'y', 'prev', 'next', 'z', 'prev_z', 'next_z', 'steiner']
    def __init__(self, i, x, y):
        self.i = i
        self.x = x
        self.y = y
        self.prev = None
        self.next = None
        self.z = 0
        self.prev_z = None
        self.next_z = None
        self.steiner = False


def linked_list(data, start, end, dim, clockwise):
    last = None
    if clockwise == (signed_area(data, start, end, dim) > 0):
        for i in range(start, end, dim):
            last = insert_node(i, data[i], data[i + 1], last)
    else:
        for i in range(end - dim, start - 1, -dim):
            last = insert_node(i, data[i], data[i + 1], last)

    if last and equals(last, last.next):
        remove_node(last)
        last = last.next

    if not last:
        return None

    last.next.prev = last
    last.prev.next = last
    # Wait, the list should already be circular from insert_node
    return last.next


def filter_points(start, end=None):
    if not start:
        return start
    if end is None:
        end = start

    p = start
    again = True
    while again or p != end:
        again = False
        if not p.steiner and (equals(p, p.next) or area(p.prev, p, p.next) == 0):
            remove_node(p)
            p = end = p.prev
            if p == p.next:
                break
            again = True
        else:
            p = p.next

    return end


def earcut_linked(ear, triangles, dim, min_x, min_y, inv_size, pass_num):
    if not ear:
        return

    if pass_num == 0 and inv_size:
        index_curve(ear, min_x, min_y, inv_size)

    stop = ear
    while ear.prev != ear.next:
        prev_n = ear.prev
        next_n = ear.next

        if is_ear_hashed(ear, min_x, min_y, inv_size) if inv_size else is_ear(ear):
            triangles.append(prev_n.i // dim)
            triangles.append(ear.i // dim)
            triangles.append(next_n.i // dim)

            remove_node(ear)

            ear = next_n.next
            stop = next_n.next
            continue

        ear = next_n

        if ear == stop:
            if pass_num == 0:
                earcut_linked(filter_points(ear), triangles, dim, min_x, min_y, inv_size, 1)
            elif pass_num == 1:
                ear = cure_local_intersections(filter_points(ear), triangles, dim)
                earcut_linked(ear, triangles, dim, min_x, min_y, inv_size, 2)
            elif pass_num == 2:
                split_earcut(ear, triangles, dim, min_x, min_y, inv_size)
            break


def is_ear(ear):
    a = ear.prev
    b = ear
    c = ear.next

    if area(a, b, c) >= 0:
        return False

    ax, ay = a.x, a.y
    bx, by = b.x, b.y
    cx, cy = c.x, c.y

    x0 = min(ax, bx, cx)
    y0 = min(ay, by, cy)
    x1 = max(ax, bx, cx)
    y1 = max(ay, by, cy)

    p = c.next
    while p != a:
        if x0 <= p.x <= x1 and y0 <= p.y <= y1 and \
           point_in_triangle(ax, ay, bx, by, cx, cy, p.x, p.y) and \
           area(p.prev, p, p.next) >= 0:
            return False
        p = p.next
    return True


def is_ear_hashed(ear, min_x, min_y, inv_size):
    a = ear.prev
    b = ear
    c = ear.next

    if area(a, b, c) >= 0:
        return False

    ax, ay = a.x, a.y
    bx, by = b.x, b.y
    cx, cy = c.x, c.y

    x0 = min(ax, bx, cx)
    y0 = min(ay, by, cy)
    x1 = max(ax, bx, cx)
    y1 = max(ay, by, cy)

    min_z = z_order(x0, y0, min_x, min_y, inv_size)
    max_z = z_order(x1, y1, min_x, min_y, inv_size)

    p = ear.prev_z
    n = ear.next_z

    while p and p.z >= min_z and n and n.z <= max_z:
        if p.x >= x0 and p.x <= x1 and p.y >= y0 and p.y <= y1 and \
           p != a and p != c and \
           point_in_triangle(ax, ay, bx, by, cx, cy, p.x, p.y) and \
           area(p.prev, p, p.next) >= 0:
            return False
        p = p.prev_z

        if n.x >= x0 and n.x <= x1 and n.y >= y0 and n.y <= y1 and \
           n != a and n != c and \
           point_in_triangle(ax, ay, bx, by, cx, cy, n.x, n.y) and \
           area(n.prev, n, n.next) >= 0:
            return False
        n = n.next_z

    while p and p.z >= min_z:
        if p.x >= x0 and p.x <= x1 and p.y >= y0 and p.y <= y1 and \
           p != a and p != c and \
           point_in_triangle(ax, ay, bx, by, cx, cy, p.x, p.y) and \
           area(p.prev, p, p.next) >= 0:
            return False
        p = p.prev_z

    while n and n.z <= max_z:
        if n.x >= x0 and n.x <= x1 and n.y >= y0 and n.y <= y1 and \
           n != a and n != c and \
           point_in_triangle(ax, ay, bx, by, cx, cy, n.x, n.y) and \
           area(n.prev, n, n.next) >= 0:
            return False
        n = n.next_z

    return True


def cure_local_intersections(start, triangles, dim):
    p = start
    while True:
        a = p.prev
        b = p.next.next

        if not equals(a, b) and intersects(a, p, p.next, b) and \
           locally_inside(a, b) and locally_inside(b, a):
            triangles.append(a.i // dim)
            triangles.append(p.i // dim)
            triangles.append(b.i // dim)

            remove_node(p)
            remove_node(p.next)

            p = start = b

        p = p.next
        if p == start:
            break

    return filter_points(p)


def split_earcut(start, triangles, dim, min_x, min_y, inv_size):
    a = start
    while True:
        b = a.next.next
        while b != a.prev:
            if a.i != b.i and is_valid_diagonal(a, b):
                c = split_polygon(a, b)

                a = filter_points(a, a.next)
                c = filter_points(c, c.next)

                earcut_linked(a, triangles, dim, min_x, min_y, inv_size, 0)
                earcut_linked(c, triangles, dim, min_x, min_y, inv_size, 0)
                return

            b = b.next
        a = a.next
        if a == start:
            break


def eliminate_holes(data, hole_indices, outer_node, dim):
    queue = []
    length = len(hole_indices)

    for i in range(length):
        start = hole_indices[i] * dim
        end = hole_indices[i + 1] * dim if i < length - 1 else len(data)
        lst = linked_list(data, start, end, dim, False)
        if lst:
            if lst == lst.next:
                lst.steiner = True
            queue.append(get_leftmost(lst))

    queue.sort(key=lambda n: n.x)

    for q in queue:
        outer_node = eliminate_hole(q, outer_node)

    return outer_node


def eliminate_hole(hole, outer_node):
    bridge = find_hole_bridge(hole, outer_node)
    if not bridge:
        return outer_node

    bridge_reverse = split_polygon(bridge, hole)

    filter_points(bridge_reverse, bridge_reverse.next)
    return filter_points(bridge, bridge.next)


def find_hole_bridge(hole, outer_node):
    p = outer_node
    hx = hole.x
    hy = hole.y
    qx = float('-inf')
    m = None

    while True:
        if hy <= p.y and hy >= p.next.y and p.next.y != p.y:
            x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y)
            if x <= hx and x > qx:
                qx = x
                m = p if p.x < p.next.x else p.next
                if x == hx:
                    return m

        p = p.next
        if p == outer_node:
            break

    if not m:
        return None

    stop = m
    mx = m.x
    my = m.y
    tan_min = float('inf')

    p = m
    while True:
        if hx >= p.x and p.x >= mx and hx != p.x and \
           point_in_triangle(hy < my and hx or qx, hy, mx, my, hy < my and qx or hx, hy, p.x, p.y):
            tan = abs(hy - p.y) / (hx - p.x)

            if locally_inside(p, hole) and (tan < tan_min or (tan == tan_min and (p.x > m.x or (p.x == m.x and sector_contains_sector(m, p))))):
                m = p
                tan_min = tan

        p = p.next
        if p == stop:
            break

    return m


def sector_contains_sector(m, p):
    return area(m.prev, m, p.prev) < 0 and area(p.next, m, m.next) < 0


def index_curve(start, min_x, min_y, inv_size):
    p = start
    while True:
        if p.z == 0:
            p.z = z_order(p.x, p.y, min_x, min_y, inv_size)
        p.prev_z = p.prev
        p.next_z = p.next
        p = p.next
        if p == start:
            break

    p.prev_z.next_z = None
    p.prev_z = None

    sort_linked(p)


def sort_linked(lst):
    in_size = 1
    num_merges = 0

    while True:
        p = lst
        lst = None
        tail = None
        num_merges = 0

        while p:
            num_merges += 1
            q = p
            p_size = 0
            for _ in range(in_size):
                p_size += 1
                q = q.next_z
                if not q:
                    break

            q_size = in_size

            while p_size > 0 or (q_size > 0 and q):
                if p_size != 0 and (q_size == 0 or not q or p.z <= q.z):
                    e = p
                    p = p.next_z
                    p_size -= 1
                else:
                    e = q
                    q = q.next_z
                    q_size -= 1

                if tail:
                    tail.next_z = e
                else:
                    lst = e

                e.prev_z = tail
                tail = e

            p = q

        tail.next_z = None
        in_size *= 2

        if num_merges <= 1:
            break

    return lst


def z_order(x, y, min_x, min_y, inv_size):
    x = int((x - min_x) * inv_size) & 0x7FFF
    y = int((y - min_y) * inv_size) & 0x7FFF

    x = (x | (x << 8)) & 0x00FF00FF
    x = (x | (x << 4)) & 0x0F0F0F0F
    x = (x | (x << 2)) & 0x33333333
    x = (x | (x << 1)) & 0x55555555

    y = (y | (y << 8)) & 0x00FF00FF
    y = (y | (y << 4)) & 0x0F0F0F0F
    y = (y | (y << 2)) & 0x33333333
    y = (y | (y << 1)) & 0x55555555

    return x | (y << 1)


def get_leftmost(start):
    p = start
    leftmost = start
    while True:
        if p.x < leftmost.x or (p.x == leftmost.x and p.y < leftmost.y):
            leftmost = p
        p = p.next
        if p == start:
            break
    return leftmost


def point_in_triangle(ax, ay, bx, by, cx, cy, px, py):
    return (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 and \
           (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 and \
           (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0


def is_valid_diagonal(a, b):
    return a.next.i != b.i and a.prev.i != b.i and \
           not intersects_polygon(a, b) and \
           (locally_inside(a, b) and locally_inside(b, a) and middle_inside(a, b) and
            (area(a.prev, a, b.prev) != 0 or area(a, b.prev, b) != 0) or
            equals(a, b) and area(a.prev, a, a.next) > 0 and area(b.prev, b, b.next) > 0)


def area(p, q, r):
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)


def equals(p1, p2):
    return p1.x == p2.x and p1.y == p2.y


def intersects(p1, q1, p2, q2):
    o1 = sign(area(p1, q1, p2))
    o2 = sign(area(p1, q1, q2))
    o3 = sign(area(p2, q2, p1))
    o4 = sign(area(p2, q2, q1))

    if o1 != o2 and o3 != o4:
        return True
    if o1 == 0 and on_segment(p1, p2, q1): return True
    if o2 == 0 and on_segment(p1, q2, q1): return True
    if o3 == 0 and on_segment(p2, p1, q2): return True
    if o4 == 0 and on_segment(p2, q1, q2): return True

    return False


def on_segment(p, q, r):
    return max(p.x, r.x) >= q.x >= min(p.x, r.x) and max(p.y, r.y) >= q.y >= min(p.y, r.y)


def sign(n):
    if n > 0: return 1
    if n < 0: return -1
    return 0


def intersects_polygon(a, b):
    p = a
    while True:
        if p.i != a.i and p.next.i != a.i and p.i != b.i and p.next.i != b.i and \
           intersects(p, p.next, a, b):
            return True
        p = p.next
        if p == a:
            break
    return False


def locally_inside(a, b):
    if area(a.prev, a, a.next) < 0:
        return area(a, b, a.next) >= 0 and area(a, a.prev, b) >= 0
    else:
        return area(a, b, a.prev) < 0 or area(a, a.next, b) < 0


def middle_inside(a, b):
    p = a
    inside = False
    px = (a.x + b.x) / 2
    py = (a.y + b.y) / 2

    while True:
        if ((p.y > py) != (p.next.y > py)) and p.next.y != p.y and \
           (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x):
            inside = not inside
        p = p.next
        if p == a:
            break

    return inside


def insert_node(i, x, y, last):
    p = Node(i, x, y)
    if not last:
        p.prev = p
        p.next = p
    else:
        p.next = last.next
        p.prev = last
        last.next.prev = p
        last.next = p
    return p


def remove_node(p):
    p.next.prev = p.prev
    p.prev.next = p.next
    if p.prev_z:
        p.prev_z.next_z = p.next_z
    if p.next_z:
        p.next_z.prev_z = p.prev_z


def split_polygon(a, b):
    a2 = Node(a.i, a.x, a.y)
    b2 = Node(b.i, b.x, b.y)
    an = a.next
    bp = b.prev

    a.next = b
    b.prev = a

    a2.next = an
    an.prev = a2

    b2.next = a2
    a2.prev = b2

    bp.next = b2
    b2.prev = bp

    return b2


def signed_area(data, start, end, dim):
    s = 0
    j = end - dim
    for i in range(start, end, dim):
        s += (data[j] - data[i]) * (data[i + 1] + data[j + 1])
        j = i
    return s


# ===========================================================================
# GeoJSON → OBJ conversion
# ===========================================================================

def process_polygon(coords_list, vertices, faces, vertex_offset):
    """
    Process a single GeoJSON polygon (outer ring + optional holes).
    coords_list[0] = outer ring, coords_list[1:] = holes
    """
    outer = coords_list[0]

    # Build flat coordinate array for earcut
    flat_coords = []
    hole_indices = []

    for pt in outer:
        flat_coords.append(pt[0])  # lon
        flat_coords.append(pt[1])  # lat

    for hi, hole in enumerate(coords_list[1:]):
        hole_indices.append(len(flat_coords) // 2)
        for pt in hole:
            flat_coords.append(pt[0])
            flat_coords.append(pt[1])

    # Triangulate
    tri_indices = earcut(flat_coords, hole_indices if hole_indices else None, 2)

    if not tri_indices:
        return vertex_offset

    # Collect all unique vertices as 3D points on sphere
    num_pts = len(flat_coords) // 2
    for i in range(num_pts):
        lon = flat_coords[i * 2]
        lat = flat_coords[i * 2 + 1]
        x, y, z = lat_lon_to_vec3(lat, lon)
        vertices.append((x, y, z))

    # Build faces (1-indexed for .obj format)
    for i in range(0, len(tri_indices), 3):
        a = tri_indices[i] + vertex_offset + 1     # .obj is 1-indexed
        b = tri_indices[i + 1] + vertex_offset + 1
        c = tri_indices[i + 2] + vertex_offset + 1
        faces.append((a, b, c))

    return vertex_offset + num_pts


def main():
    print("Fetching GeoJSON from:", GEOJSON_URL)
    req = urllib.request.Request(GEOJSON_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        geojson = json.loads(response.read().decode('utf-8'))

    print(f"Loaded {len(geojson['features'])} features")

    vertices = []
    faces = []
    vertex_offset = 0
    skipped = 0
    processed = 0

    for fi, feature in enumerate(geojson['features']):
        geom = feature['geometry']
        name = feature.get('properties', {}).get('name', f'Feature_{fi}')

        if geom['type'] == 'Polygon':
            new_offset = process_polygon(geom['coordinates'], vertices, faces, vertex_offset)
            if new_offset > vertex_offset:
                processed += 1
            else:
                skipped += 1
            vertex_offset = new_offset

        elif geom['type'] == 'MultiPolygon':
            for polygon_coords in geom['coordinates']:
                new_offset = process_polygon(polygon_coords, vertices, faces, vertex_offset)
                if new_offset > vertex_offset:
                    processed += 1
                else:
                    skipped += 1
                vertex_offset = new_offset

    # Write .obj file
    import os
    out_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(out_dir, 'continents-sphere.obj')

    print(f"\nWriting OBJ: {len(vertices)} vertices, {len(faces)} faces")
    print(f"Polygons processed: {processed}, skipped: {skipped}")

    with open(out_path, 'w') as f:
        f.write(f"# Continents on sphere (R={R})\n")
        f.write(f"# Generated from {GEOJSON_URL}\n")
        f.write(f"# Same projection as community-globe-v3.1.js latLonToVec3()\n")
        f.write(f"# Vertices: {len(vertices)}, Faces: {len(faces)}\n\n")
        f.write("o Continents\n\n")

        for v in vertices:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")

        f.write("\n")

        for face in faces:
            f.write(f"f {face[0]} {face[1]} {face[2]}\n")

    print(f"\nSaved to: {out_path}")
    print("Done!")


if __name__ == '__main__':
    main()
