import json, sys, os, subprocess
D = sys.argv[1]
pcs = set()
for t in ["livewell-service","district-service","activity","service","financial-support","organisation"]:
    for x in json.load(open(os.path.join(D, t + ".json"))):
        a = x.get("acf") or {}
        if not isinstance(a, dict): continue
        for k in ("service_postcode", "post-code"):
            v = (a.get(k) or "").strip().upper()
            if 5 <= len(v) <= 8: pcs.add(v)
pcs = sorted(pcs); out = {}
for i in range(0, len(pcs), 100):
    body = json.dumps({"postcodes": pcs[i:i+100]})
    r = subprocess.run(["curl","-s","-m","60","-X","POST","https://api.postcodes.io/postcodes","-H","Content-Type: application/json","-d",body],capture_output=True,text=True)
    for row in json.loads(r.stdout)["result"]:
        res = row.get("result")
        if res: out[row["query"]] = [round(res["latitude"],6), round(res["longitude"],6), res.get("admin_ward"), res.get("admin_district")]
oc = {}
for o in ["OL1","OL2","OL3","OL4","OL8","OL9","M35"]:
    r = subprocess.run(["curl","-s","-m","30",f"https://api.postcodes.io/outcodes/{o}"],capture_output=True,text=True)
    j = json.loads(r.stdout)["result"]
    oc[o] = {"lat": round(j["latitude"],5), "lng": round(j["longitude"],5), "parish": j.get("parish"), "wards": j.get("admin_ward")}
json.dump({"postcodes": out, "outcodes": oc}, open(os.path.join(D, "geo.json"), "w"))
print(len(pcs), "postcodes,", len(out), "found"); print(json.dumps(oc)[:1200])
