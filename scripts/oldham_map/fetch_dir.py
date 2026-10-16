import json, sys, subprocess, os, time
D = sys.argv[1]
UA = "GreenCircles-Oldham-hackathon/1.0 (prototype)"
B = "https://services.oldham.gov.uk/wp-json/wp/v2/"
def get(url, out):
    r = subprocess.run(["curl","-sL","-m","60","-A",UA,"-D","-",url,"-o",out],capture_output=True,text=True)
    hdr = {}
    for line in r.stdout.splitlines():
        if ":" in line:
            k,v = line.split(":",1); hdr[k.strip().lower()] = v.strip()
    return hdr
for t in ["activity","service","financial-support","livewell-service","organisation","location","district-service","computer","service-at-location","main-category","directory_theme"]:
    allx = []; page = 1
    while True:
        out = os.path.join(D, f"{t}_{page}.json")
        h = get(f"{B}{t}?per_page=100&page={page}", out)
        try: d = json.load(open(out))
        except Exception: print(t, "bad json page", page); break
        if not isinstance(d, list) or not d: break
        allx += d
        tp = int(h.get("x-wp-totalpages", "1"))
        if page >= tp: break
        page += 1; time.sleep(0.5)
    json.dump(allx, open(os.path.join(D, f"{t}.json"), "w"))
    print(t, len(allx), flush=True)
