import json, sys, urllib.request, urllib.parse, time, os
D = sys.argv[1]
UA = "GreenCircles-Oldham-hackathon/1.0 (prototype)"
def op(q, name):
    path = os.path.join(D, name + ".json")
    if os.path.exists(path):
        return json.load(open(path))
    import subprocess
    wait = 5
    for attempt in range(7):
        subprocess.run(["curl","-s","-m","180","-A",UA,"-H","Accept: application/json","-X","POST","https://overpass-api.de/api/interpreter","--data-urlencode","data="+q,"-o",path])
        r = open(path,"rb").read()
        try:
            j = json.loads(r)
            if "remark" in j and not j.get("elements"): raise ValueError(j["remark"])
            break
        except Exception as e:
            print(name, "retry", attempt, str(e)[:80], flush=True)
            os.remove(path); time.sleep(wait); wait = min(wait*2, 60)
    else:
        raise RuntimeError("gave up")
    time.sleep(2)
    return json.loads(r)
AREA = "area(3600146925)->.a;"
BB = "(53.47,-2.25,53.63,-1.90)"
qs = {
 "parkgeom": AREA + '(way["leisure"~"park|nature_reserve"]["name"](area.a);way["landuse"="forest"]["name"](area.a););out geom;',
 "wards": AREA + 'rel(area.a)["boundary"~"political|administrative"]["admin_level"~"10|9"];out geom;',
 "wards2": AREA + 'rel(area.a)["political_division"="ward"];out geom;',
 "roads": f'[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|motorway_link|trunk_link)$"]{BB};out geom;',
 "secondary": AREA.join(['[out:json][timeout:120];','way["highway"="secondary"](area.a);out geom;']),
 "tram": f'[out:json][timeout:120];(way["railway"="tram"]{BB};node["railway"="tram_stop"]{BB};node["public_transport"="station"]["network"~"Metrolink"]{BB};);out geom;',
 "rail": f'[out:json][timeout:120];(way["railway"="rail"]["service"!~"."]{BB};node["railway"="station"]{BB};);out geom;',
 "water": AREA.join(['[out:json][timeout:120];','(way["natural"="water"]["name"](area.a);way["waterway"="river"](area.a););out geom;']),
 "parks": AREA.join(['[out:json][timeout:120];','(way["leisure"~"park|nature_reserve"]["name"](area.a);rel["leisure"~"park|nature_reserve"]["name"](area.a););out center tags;']),
 "places": AREA.join(['[out:json][timeout:60];','node["place"~"^(town|suburb|village|neighbourhood|hamlet)$"](area.a);out;']),
 "pois": AREA.join(['[out:json][timeout:120];','(nwr["amenity"~"^(library|college|university|hospital|community_centre|townhall|social_facility|job_centre|arts_centre|theatre|clinic|doctors|youth_centre|social_centre)$"](area.a);nwr["office"~"employment_agency|government|charity|ngo"](area.a);nwr["social_facility"](area.a);nwr["leisure"="sports_centre"](area.a);nwr["shop"="mall"](area.a);nwr["landuse"="industrial"]["name"](area.a);nwr["club"="youth"](area.a);nwr["amenity"="school"]["isced:level"~"3"](area.a););out center tags;']),
}
for k, q in qs.items():
    if not q.startswith("["): q = "[out:json][timeout:120];" + q
    try:
        d = op(q, k); print(k, len(d.get("elements", [])))
    except Exception as e:
        print(k, "ERR", e)
