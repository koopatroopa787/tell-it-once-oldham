import json, sys, os, re, html, math

S = sys.argv[1]
OUT = sys.argv[2]
DATA = os.path.join(S, "data")
DIR = os.path.join(S, "dir")

BB = (53.47, -2.25, 53.63, -1.90)  # s, w, n, e


def load(p):
    return json.load(open(p))


def inbb(lat, lng, pad=0.0):
    return BB[0] - pad <= lat <= BB[2] + pad and BB[1] - pad <= lng <= BB[3] + pad


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best:
                best, bi = d, i
        if best > tol * tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def line(geom, tol):
    pts = [(g["lat"], g["lon"]) for g in geom]
    pts = dp(pts, tol)
    return [[round(a, 5), round(b, 5)] for a, b in pts]


def clean(s, n=None):
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    s = re.sub(r"\s+", " ", s).strip()
    if n and len(s) > n:
        s = s[: n - 1].rsplit(" ", 1)[0] + "…"
    return s


# ---------- basemap ----------
nom = load(os.path.join(DATA, "nom2.json"))
bound = next(x for x in nom if x["osm_type"] == "relation")["geojson"]
rings = bound["coordinates"] if bound["type"] == "Polygon" else [r for poly in bound["coordinates"] for r in poly]
boundary = []
for ring in rings:
    pts = dp([(c[1], c[0]) for c in ring], 0.00015)
    boundary.append([[round(a, 5), round(b, 5)] for a, b in pts])

roads = {"motorway": [], "trunk": [], "primary": [], "secondary": []}
for f in ("roads.json", "secondary.json"):
    for e in load(os.path.join(DATA, f))["elements"]:
        if e["type"] != "way" or "geometry" not in e:
            continue
        h = e["tags"].get("highway", "")
        if h.endswith("_link"):
            continue
        if h not in roads:
            continue
        tol = 0.00012 if h != "secondary" else 0.00018
        roads[h].append({"p": line(e["geometry"], tol), "r": e["tags"].get("ref", ""), "n": e["tags"].get("name", "")})

tram = load(os.path.join(DATA, "tram.json"))["elements"]
tram_lines = [line(e["geometry"], 0.00008) for e in tram if e["type"] == "way" and "geometry" in e]
stops = {}
for e in tram:
    if e["type"] == "node":
        n = e["tags"].get("name")
        if not n or n in ("Depot", "Tram Museum"):
            continue
        stops.setdefault(n, []).append((e["lat"], e["lon"]))
tram_stops = [{"n": n, "lat": round(sum(p[0] for p in v) / len(v), 5), "lng": round(sum(p[1] for p in v) / len(v), 5)} for n, v in stops.items()]

rail = load(os.path.join(DATA, "rail.json"))["elements"]
rail_lines = [line(e["geometry"], 0.00015) for e in rail if e["type"] == "way" and "geometry" in e and e["tags"].get("usage") in ("main", "branch", None)]
stations = {}
for e in rail:
    if e["type"] == "node" and e["tags"].get("name") and e["tags"].get("network") == "National Rail":
        stations.setdefault(e["tags"]["name"], (e["lat"], e["lon"]))
rail_stations = [{"n": n, "lat": round(a, 5), "lng": round(b, 5)} for n, (a, b) in stations.items()]

water_polys, rivers = [], []
for e in load(os.path.join(DATA, "water.json"))["elements"]:
    if e["type"] != "way" or "geometry" not in e:
        continue
    if e["tags"].get("waterway") == "river":
        rivers.append({"p": line(e["geometry"], 0.00015), "n": e["tags"].get("name", "")})
    else:
        water_polys.append({"p": line(e["geometry"], 0.0001), "n": e["tags"].get("name", "")})

parks = []
pg = os.path.join(DATA, "parkgeom.json")
if os.path.exists(pg):
    for e in load(pg)["elements"]:
        if e["type"] == "way" and "geometry" in e and e["tags"].get("name"):
            parks.append({"p": line(e["geometry"], 0.0001), "n": e["tags"]["name"]})
park_pts = []
for e in load(os.path.join(DATA, "parks.json"))["elements"]:
    c = e.get("center") or ({"lat": e.get("lat"), "lon": e.get("lon")} if "lat" in e else None)
    if c and e["tags"].get("name"):
        park_pts.append({"n": e["tags"]["name"], "lat": round(c["lat"], 5), "lng": round(c["lon"], 5)})

places = []
pp = os.path.join(DATA, "places.json")
if os.path.exists(pp):
    rank = {"town": 1, "suburb": 2, "village": 2, "neighbourhood": 3, "hamlet": 3}
    for e in load(pp)["elements"]:
        t = e["tags"].get("place")
        if e["tags"].get("name") and t in rank:
            places.append({"n": e["tags"]["name"], "r": rank[t], "lat": round(e["lat"], 5), "lng": round(e["lon"], 5)})

landmarks = []
pp = os.path.join(DATA, "pois.json")
libraries = []
osm_items = []
if os.path.exists(pp):
    for e in load(pp)["elements"]:
        tg = e["tags"]
        c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
        if not tg.get("name") or c["lat"] is None:
            continue
        a = tg.get("amenity", "")
        rec = {"n": tg["name"], "lat": round(c["lat"], 5), "lng": round(c["lon"], 5), "ty": a or tg.get("office") or tg.get("leisure") or tg.get("shop") or tg.get("landuse"),
               "ph": tg.get("phone") or tg.get("contact:phone") or "", "url": tg.get("website") or tg.get("contact:website") or "",
               "a": ", ".join(x for x in [tg.get("addr:housenumber", ""), tg.get("addr:street", ""), tg.get("addr:postcode", "")] if x)}
        if a == "library":
            libraries.append(rec)
        if a in ("community_centre", "social_centre") or tg.get("office") == "employment_agency" or "jobcentre" in tg["name"].lower():
            osm_items.append(rec)
        if a in ("library", "college", "university", "hospital", "townhall") or tg.get("shop") == "mall" or a == "arts_centre" or a == "theatre":
            landmarks.append(rec)

# ---------- directory ----------
geo = load(os.path.join(DIR, "geo.json"))
PC = geo["postcodes"]
taxsub = {}
for f in ("tax_livewell-sub-category.json", "tax_lwsub2.json"):
    for x in load(os.path.join(DIR, f)):
        taxsub[x["id"]] = html.unescape(x["name"])
taxcat = {x["id"]: html.unescape(x["name"]) for x in load(os.path.join(DIR, "tax_livewell-category.json"))}


def L(v):
    return v if isinstance(v, list) else ([v] if v else [])


LAYER_BY_CAT = {341: "work", 342: "work", 356: "social", 456: "social", 459: "social", 361: "money", 377: "money",
                420: "health", 500: "health", 366: "support", 391: "support", 392: "support", 419: "support",
                427: "support", 367: "support", 460: "support"}
PRIORITY = ["vol", "work", "online", "social", "money", "health", "support"]

items = []


def add(rec, layers):
    layers = [l for l in PRIORITY if l in set(layers)] or ["support"]
    rec["k"] = layers[0]
    rec["ks"] = layers
    rec["id"] = "i%d" % len(items)
    items.append(rec)


def locate(pc):
    pc = (pc or "").strip().upper()
    g = PC.get(pc)
    if g and inbb(g[0], g[1], 0.05):
        return g[0], g[1]
    return None, None


# patches verified from providers' own sites on 16 Oct 2026
PATCH = {
    "Get Oldham Working": {"pc": "OL1 1BE", "a": "First Place, 22 Union Street, Oldham", "ph": "0161 770 4674", "em": "getoldhamworking@oldham.gov.uk"},
    "Positive Steps career guidance": {"ph": "0161 621 9400", "em": "info@positive-steps.org.uk", "a": "Medtia Place, 80 Union Street, Oldham"},
    "Oldham College Careers Service": {"ph": "0161 785 4000"},
    "Oldham College adult courses": {"ph": "0161 785 4000"},
}

for x in load(os.path.join(DIR, "livewell-service.json")):
    a = x["acf"]
    name = clean(a.get("service_name"))
    if not name:
        continue
    cats = L(a.get("livewell_category"))
    subs = L(a.get("lw_sub-category"))
    sub_names = [taxsub.get(s, "") for s in subs if taxsub.get(s)]
    layers = [LAYER_BY_CAT.get(c, "support") for c in cats]
    if 357 in subs or "volunteer" in name.lower():
        layers.insert(0, "vol")
    if 352 in subs:
        layers.append("online")
    p = PATCH.get(name, {})
    pc = p.get("pc") or a.get("service_postcode")
    lat, lng = locate(pc)
    add({"n": name, "src": x["link"], "from": "LiveWell directory", "cat": [taxcat.get(c, "") for c in cats], "sub": sub_names,
         "d": clean(a.get("lw_description"), 340), "e": clean(a.get("lw_eligibility"), 220),
         "how": clean(" ".join(filter(None, [a.get("referral_type"), a.get("referral_details")])), 240),
         "c": clean(a.get("cost"), 120), "t": clean(a.get("opening_times"), 140), "url": a.get("referral_url") or "",
         "ph": p.get("ph", ""), "em": p.get("em", ""), "a": p.get("a") or clean(a.get("service_address"), 120), "pc": (pc or "").upper(),
         "lat": lat, "lng": lng}, layers)

MAINCAT = {273: "Sports", 554: "Clubs", 4: "Activities and Leisure", 5: "Education and Childcare", 9: "Young People", 10: "Training and employment"}
for x in load(os.path.join(DIR, "activity.json")):
    a = x["acf"]
    loc = a.get("location") or {}
    lat, lng = (loc.get("lat"), loc.get("lng")) if isinstance(loc, dict) else (None, None)
    if not lat or not inbb(float(lat), float(lng)):
        lat, lng = locate(a.get("post-code"))
    if not lat:
        continue
    cats = [MAINCAT.get(c, "") for c in x.get("main-category", []) if MAINCAT.get(c)]
    addr = ", ".join(filter(None, [a.get("address_1"), a.get("address_2"), a.get("address_3")]))
    add({"n": clean(x["title"]["rendered"]), "src": x["link"], "from": "Activities and groups directory", "cat": cats or ["Activities and groups"], "sub": [clean(a.get("description_2"), 60)] if a.get("description_2") else [],
         "d": clean(x["content"]["rendered"], 340), "e": clean(a.get("eligibility") or a.get("age_range_text"), 200), "how": clean(a.get("referral_route"), 200),
         "c": "", "t": clean(a.get("opening_times"), 140), "url": a.get("website") or "", "ph": clean(a.get("telephone")), "em": clean(a.get("email")),
         "a": clean(addr, 120), "pc": (a.get("post-code") or "").upper(), "lat": round(float(lat), 6), "lng": round(float(lng), 6)}, ["social"])

KEEP_ST = {310: "support", 311: "money", 312: "support", 313: "support", 314: "money", 315: "money", 316: "support", 318: "support",
           319: "work", 322: "health", 323: "support", 178: "health"}
STN = {x["id"]: html.unescape(x["name"]) for x in load(os.path.join(DIR, "tax_service-type.json"))}
for x in load(os.path.join(DIR, "service.json")):
    sts = [s for s in x.get("service-type", []) if s in KEEP_ST]
    if not sts:
        continue
    a = x["acf"]
    loc = a.get("location") or {}
    lat, lng = (loc.get("lat"), loc.get("lng")) if isinstance(loc, dict) else (None, None)
    if not lat or not inbb(float(lat), float(lng)):
        continue
    addr = ", ".join(filter(None, [a.get("address_1"), a.get("address_2"), a.get("address_3")]))
    add({"n": clean(x["title"]["rendered"]), "src": x["link"], "from": "Health and social care directory", "cat": [STN[s] for s in sts], "sub": [],
         "d": clean(x["content"]["rendered"] or a.get("description"), 340), "e": clean(a.get("eligibility"), 200), "how": clean(a.get("referral_route"), 200),
         "c": "", "t": clean(a.get("opening_times"), 140), "url": a.get("website") or "", "ph": clean(a.get("telephone")), "em": clean(a.get("email")),
         "a": clean(addr, 120), "pc": (a.get("post-code") or "").upper(), "lat": round(float(lat), 6), "lng": round(float(lng), 6)}, [KEEP_ST[s] for s in sts])

for x in load(os.path.join(DIR, "financial-support.json")):
    a = x["acf"]
    loc = a.get("location") or {}
    if not isinstance(loc, dict) or not loc.get("lat"):
        continue
    name = clean(x["title"]["rendered"])
    lay = ["online"] if re.search(r"bytes|digital|online|computer", name + " " + clean(x["content"]["rendered"]), re.I) else ["money"]
    addr = ", ".join(filter(None, [a.get("address_1"), a.get("address_2"), a.get("address_3")])) or clean(loc.get("address"))
    add({"n": name, "src": x["link"], "from": "Financial support directory", "cat": ["Financial support"], "sub": [],
         "d": clean(x["content"]["rendered"] or a.get("description"), 340), "e": clean(a.get("eligibility"), 200), "how": clean(a.get("referral_route"), 200),
         "c": "", "t": clean(a.get("opening_times"), 140), "url": a.get("website") or "", "ph": clean(a.get("telephone")), "em": clean(a.get("email")),
         "a": clean(addr, 140), "pc": (a.get("post-code") or "").upper(), "lat": round(float(loc["lat"]), 6), "lng": round(float(loc["lng"]), 6)}, lay)

# public computers -> match to OSM libraries by name
for x in load(os.path.join(DIR, "computer.json")):
    name = clean(x["title"]["rendered"])
    key = name.lower().replace(" library", "").strip()
    hit = next((l for l in libraries if key and key in l["n"].lower()), None)
    if not hit:
        continue
    add({"n": name + " – free computers", "src": x["link"], "from": "Public computers directory", "cat": ["Get online"], "sub": ["Free computers and Wi-Fi"],
         "d": "Free public computers you can use to search and apply for jobs, do coursework or get online. Ask staff if you need help getting started.",
         "e": "Anyone. You may need a library card, which is free.", "how": "Drop in during library opening hours.", "c": "Free", "t": "", "url": hit["url"], "ph": hit["ph"], "em": "",
         "a": hit["a"], "pc": "", "lat": hit["lat"], "lng": hit["lng"]}, ["online"])

# food banks (Give Food API, fetched today)
gf = load(os.path.join(DATA, "gf_oldham.json"))
fetched = open(os.path.join(DATA, "gf_fetched.txt")).read().strip()
lat, lng = map(float, gf["lat_lng"].split(","))
needs = (load(os.path.join(DATA, "gf_search.json"))[0].get("needs") or {}).get("needs", "")
add({"n": "Oldham Foodbank", "src": gf["urls"]["html"], "from": "Give Food API", "cat": ["Food banks"], "sub": ["Emergency food"],
     "d": "Trussell food bank for Oldham. You need a referral voucher from an agency such as Citizens Advice, your GP or a support worker. Currently asking donors for: " + ", ".join(needs.split("\n")[:5]) + ".",
     "e": "Anyone in crisis who has been referred.", "how": "Ask a support worker, GP, school or advice service for a food bank voucher.", "c": "Free",
     "t": "", "url": gf["urls"]["homepage"], "ph": "0161 622 1061", "em": gf.get("email", ""), "a": clean(gf["address"].replace("\r\n", ", ")), "pc": gf["postcode"],
     "lat": round(lat, 6), "lng": round(lng, 6), "fetched": fetched}, ["money"])
for loc in gf.get("locations", []):
    la, ln = map(float, loc["lat_lng"].split(","))
    add({"n": "Oldham Foodbank – " + loc["name"], "src": gf["urls"]["html"], "from": "Give Food API", "cat": ["Food banks"], "sub": ["Emergency food"],
         "d": "A distribution centre for Oldham Foodbank. Bring your referral voucher.", "e": "Anyone in crisis who has been referred.", "how": "Ask a support worker, GP, school or advice service for a food bank voucher.",
         "c": "Free", "t": "", "url": gf["urls"]["homepage"], "ph": "0161 622 1061", "em": "", "a": clean(loc["address"].replace("\r\n", ", ")), "pc": loc.get("postcode", ""),
         "lat": round(la, 6), "lng": round(ln, 6), "fetched": fetched}, ["money"])

# OpenStreetMap places: job agencies, Jobcentre, community centres
for r in osm_items:
    rn = r["n"].lower()
    if any(rn in i["n"].lower() or i["n"].lower() in rn for i in items if len(i["n"]) > 4):
        continue
    if "jobcentre" in r["n"].lower():
        d, lay, cat = "Government Jobcentre. Help with Universal Credit, job search and referrals to training and work programmes.", ["work"], ["Job search"]
    elif r["ty"] == "employment_agency":
        d, lay, cat = "Recruitment agency. Register to hear about local vacancies, often temporary or entry-level roles.", ["work"], ["Recruitment agency"]
    elif r["n"].lower().startswith("mahdlo"):
        d, lay, cat = "Mahdlo Youth Zone: sport, arts, music and clubs for young people aged 8 to 19 (up to 25 with additional needs).", ["social"], ["Youth zone"]
    else:
        d, lay, cat = "Community centre. Ask what groups, events and classes are running.", ["social"], ["Community centre"]
    add({"n": r["n"], "src": "https://www.openstreetmap.org/", "from": "OpenStreetMap", "cat": cat, "sub": [], "d": d, "e": "", "how": "", "c": "", "t": "",
         "url": r["url"], "ph": r["ph"], "em": "", "a": r["a"], "pc": "", "lat": r["lat"], "lng": r["lng"]}, lay)

# anything that mentions volunteering also shows on the volunteering layer
for i in items:
    if "vol" not in i["ks"] and re.search(r"volunteer", " ".join([i["n"], i.get("d", ""), " ".join(i.get("sub", []))]), re.I):
        i["ks"].append("vol")

# verified anchors not in the directory
for name, pc, ph, url, d, lay, addr in [
    ("Oldham Sixth Form College", "OL8 1XU", "0161 287 8000", "https://www.osfc.ac.uk/", "Sixth form college offering A levels and vocational courses for 16 to 18 year olds.", ["work"], "Union Street West, Oldham"),
    ("Oldham Theatre Workshop", "OL1 1AL", "0161 770 3240", "https://oldhamtheatreworkshop.co.uk/", "Youth theatre for young people in Oldham: acting, performance and backstage skills.", ["social"], "JR Clynes Building, Greaves Street, Oldham"),
]:
    if any(i["n"] == name for i in items):
        continue
    la, ln = locate(pc)
    add({"n": name, "src": url, "from": "Provider website (checked 16 Oct 2026)", "cat": ["Education and Learning" if lay == ["work"] else "Sport, Leisure & Culture"], "sub": [],
         "d": d, "e": "", "how": "", "c": "", "t": "", "url": url, "ph": ph, "em": "", "a": addr, "pc": pc, "lat": la, "lng": ln}, lay)

# dedupe by name+rounded location
seen, uniq = set(), []
for i in items:
    k = (i["n"].lower(), round(i["lat"] or 0, 3), round(i["lng"] or 0, 3))
    if k in seen:
        continue
    seen.add(k)
    uniq.append(i)
items = uniq
for i in items:
    for k in list(i):
        if i[k] in ("", None, []) and k not in ("lat", "lng"):
            del i[k]

out = {"boundary": boundary, "roads": roads, "tram": {"lines": tram_lines, "stops": tram_stops}, "rail": {"lines": rail_lines, "stations": rail_stations},
       "water": {"polys": water_polys, "rivers": rivers}, "parks": parks, "parkPts": park_pts, "places": places, "landmarks": landmarks,
       "items": items, "outcodes": geo["outcodes"],
       "meta": {"osm": "OpenStreetMap contributors, fetched 16 Oct 2026", "directory": "Oldham Council service directory (services.oldham.gov.uk), fetched 16 Oct 2026", "givefood": fetched}}
js = "window.OLDHAM=" + json.dumps(out, separators=(",", ":"), ensure_ascii=False) + ";"
open(OUT, "w").write(js)
from collections import Counter
print("bytes", len(js), "items", len(items), Counter(i["k"] for i in items), "vol-any", sum(1 for i in items if "vol" in i["ks"]), "located", sum(1 for i in items if i.get("lat")))
print("roads", {k: len(v) for k, v in roads.items()}, "tram", len(tram_lines), len(tram_stops), "rail", len(rail_lines), len(rail_stations), "water", len(water_polys), len(rivers), "parks", len(parks), len(park_pts), "places", len(places), "landmarks", len(landmarks), "libs", len(libraries))
