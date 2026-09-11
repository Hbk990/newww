#!/usr/bin/env python3
"""
Derives the reference seed files from the wholesale catalog export.

Run once, by hand, when a fresh export arrives — not part of any build. Its
output (categories.json, brands.json, devices.json) is committed, so seeding a
new environment never needs the spreadsheet. It is kept here so the taxonomy
fixes and the device classifier are reviewable and re-runnable rather than a
one-off nobody can reproduce.

    python3 seed/derive-from-export.py    # expects the CSV path in F below

See seed/README.md for what it decides and what it deliberately leaves alone.
"""
import csv, json, re, collections, unicodedata

F="/root/.claude/uploads/73cf6f3d-1bc4-5427-ae22-49f26e59c02d/1bf7dba4-DRPHONEcatalog20260910.csv"
rows=list(csv.DictReader(open(F,encoding="utf-8-sig")))
def J(s):
    try: return json.loads((s or "").strip() or "null")
    except Exception: return None

def slug(s):
    s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode()
    # "+" is meaningful in device names and must survive: a Galaxy Tab A9 case
    # does not fit a Tab A9+, and stripping it collapsed four real models onto
    # their non-plus siblings, silently dropping them.
    s=s.replace("+","-plus")
    s=re.sub(r"[^a-zA-Z0-9]+","-",s).strip("-").lower()
    return re.sub(r"-{2,}","-",s)

# ---------------------------------------------------------------- categories
DROP_CATEGORIES={"Razer","HyperX","Mix Product","Vape"}
REHOME={"Tablet":"Gaming & Computers"}
tree=collections.defaultdict(collections.Counter)
for r in rows:
    cat, group = r["category"], r["category_group"]
    if cat in DROP_CATEGORIES: continue
    tree[REHOME.get(cat, group)][cat]+=1

# Categories replacing the Mix Product drawer, created only where the contents
# actually cluster. Counts are from the export.
NEW={"Mobile Accessories & Power":[],
     "Home & Personal Care":["Kitchen & Drinkware","Grooming","Cleaning","Humidifier & Air","Night Light","Furniture & Comfort"],
     "Toys, Lifestyle & Miscellaneous":["Stationery & Print","Travel & Outdoor"]}

categories=[]
for gi,(group,cats) in enumerate(sorted(tree.items(), key=lambda kv:-sum(kv[1].values()))):
    categories.append({"slug":slug(group),"name":group,"parent":None,"position":gi})
    names=[c for c,_ in cats.most_common()]+NEW.get(group,[])
    for ci,name in enumerate(names):
        categories.append({"slug":slug(name),"name":name,"parent":slug(group),"position":ci,
                           "products_in_export":cats.get(name,0)})

# ---------------------------------------------------------------- brands
raw=collections.Counter(r["brand"].strip() for r in rows if r["brand"].strip())
best={}
for name,n in raw.most_common():
    key=name.lower()
    # First win is the most frequent spelling, so "SanDisk" beats "Sandisk".
    if key not in best: best[key]={"slug":slug(name),"name":name,"products_in_export":n}
    else: best[key]["products_in_export"]+=n
brands=sorted(best.values(), key=lambda b:(-b["products_in_export"], b["name"]))

# ---------------------------------------------------------------- devices
NOT_DEVICE=re.compile(r"(?i)^(standard|\d+\s?(gb|tb|mah)|\d*\s*ram|.*\bram\b|lighting|lightning|type-?c|micro|black|white|pink|blue|green|red|grey|gray|silver|gold|purple|orange|colors? roll|label white|white roll)$")
labels=collections.Counter(); ctx=collections.defaultdict(set)
for r in rows:
    for d in (J(r["options_json"]) or []):
        for part in re.split(r"\s*/\s*", str(d.get("name","")).strip()):
            part=part.strip()
            if part and not NOT_DEVICE.match(part):
                labels[part]+=1
                ctx[part].add(r["name"].lower()+" "+r["category"].lower())

def classify(label, contexts):
    t=label.strip()
    tab = any(("tab" in c or "ipad" in c) for c in contexts)
    low=t.lower().replace("mac","max")          # "14 Pro Mac" is a typo
    low=re.sub(r"\s+"," ",low)

    if "ipad" in low or re.match(r"^(pro 11|pro 13|12\.9|air 10\.9)", low):
        m=re.search(r"ipad\s*(\d+)", low)
        if m: return "Apple","iPad",f"iPad {m.group(1)}"
        if "pro 11" in low:
            year=re.search(r"(20\d{2})", low)
            return "Apple","iPad", f"iPad Pro 11 ({year.group(1)})" if year else "iPad Pro 11"
        if "pro 13" in low: return "Apple","iPad","iPad Pro 13"
        if "12.9" in low: return "Apple","iPad","iPad Pro 12.9"
        if "air 10.9" in low: return "Apple","iPad","iPad Air 10.9"
        return None
    m=re.match(r"^(1[1-8])\b\s*(air|plus|pro max|pro|max)?$", low)
    if m:
        n,suffix=m.group(1), (m.group(2) or "")
        name="iPhone "+n+(" "+suffix.title().replace("Pro Max","Pro Max") if suffix else "")
        return "Apple","iPhone",name.strip()
    m=re.match(r"^s(9|10|11)\b\s*(fe \+|fe\+|fe|lite)?$", low)
    if m and tab:
        suf={"fe":"FE","fe +":"FE+","fe+":"FE+","lite":"Lite","":""}[m.group(2) or ""]
        return "Samsung","Galaxy Tab S",f"Galaxy Tab S{m.group(1)}{(' '+suf) if suf else ''}"
    m=re.match(r"^s(2[4-6])\s*ultra$", low)
    if m: return "Samsung","Galaxy S",f"Galaxy S{m.group(1)} Ultra"
    m=re.match(r"^a(8|9|11)\s*(\+|plus)?$", low)
    if m and tab:
        return "Samsung","Galaxy Tab A",f"Galaxy Tab A{m.group(1)}{'+' if m.group(2) else ''}"
    m=re.match(r"^a(\d{2})(s)?$", low)
    if m and not tab: return "Samsung","Galaxy A",f"Galaxy A{m.group(1)}{'s' if m.group(2) else ''}"
    m=re.match(r"^redmi\s+(note\s+\d+(\s+pro)?|\d+c|a\d+)$", low)
    if m: return "Xiaomi","Redmi","Redmi "+re.sub(r"\s+"," ",m.group(1)).title().replace("Note","Note")
    if re.match(r"^hot\s*\d", low):
        rest=re.sub(r"^hot\s*","",low)
        rest=re.sub(r"\s*\b4g\b","",rest)          # 4G is not part of the model name here
        m2=re.match(r"^(\d+)\s*(i)?\s*(pro)?\s*(\+)?$", rest.strip())
        if m2:
            name=f"Hot {m2.group(1)}"
            if m2.group(2): name+="i"
            if m2.group(3): name+=" Pro"
            if m2.group(4): name+="+"
            return "Infinix","Hot",name
        return None
    if re.match(r"^smart\s*\d", low): return "Infinix","Smart","Smart "+re.sub(r"^smart\s*","",low)
    if re.match(r"^note\s*\d", low):
        n=re.sub(r"^note\s*","",low); n=re.sub(r"\s*4g$","",n)
        return "Infinix","Note","Note "+n.title().strip()
    if re.match(r"^(spark|pova)\b", low):
        return "Tecno","Spark" if low.startswith("spark") else "Pova", low.title()
    return None

models={}; review=[]
for label,n in labels.most_common():
    got=classify(label, ctx[label])
    if not got:
        review.append({"label":label,"count":n}); continue
    brand,family,name=got
    key=(brand,name)
    if key not in models:
        models[key]={"brand":brand,"family":family,"slug":slug(f"{brand} {name}"),"name":name,"labels":[label],"count":n}
    else:
        models[key]["labels"].append(label); models[key]["count"]+=n

device_brands=[]
for i,b in enumerate(["Apple","Samsung","Xiaomi","Infinix","Tecno"]):
    device_brands.append({"slug":slug(b),"name":b,"position":i})

devices=sorted(models.values(), key=lambda m:(m["brand"],m["family"],m["name"]))

json.dump({"categories":categories},open("seed/categories.json","w"),indent=2,ensure_ascii=False)
json.dump({"brands":brands},open("seed/brands.json","w"),indent=2,ensure_ascii=False)
json.dump({"device_brands":device_brands,"device_models":devices},open("seed/devices.json","w"),indent=2,ensure_ascii=False)
json.dump({"unclassified_device_labels":review},open("seed/devices-needs-review.json","w"),indent=2,ensure_ascii=False)

print(f"categories: {sum(1 for c in categories if c['parent'] is None)} groups, {sum(1 for c in categories if c['parent'])} children")
print(f"brands: {len(brands)} (from {len(raw)} raw spellings)")
print(f"device models: {len(devices)} (from {len(labels)} raw labels)")
print(f"unclassified device labels: {len(review)} -> {[r['label'] for r in review]}")
