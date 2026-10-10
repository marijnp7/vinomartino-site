#!/usr/bin/env python3
"""Kakheti PDO geographic extent, NOT planted vineyards.
NWA specification section 4 explicitly defines the area by the eight Kakheti
municipalities. Natural Earth supplies a simplified outline of their regional
union. Section 6 separately limits vineyard altitude (200-750m); the outline is
not a representation of that cultivation mask. Never label it vineyard cover.
Usage: python scripts/cartography/build-kakheti.py /path/ne-admin1.geojson
"""
import json,sys
from pathlib import Path
from shapely.geometry import shape,mapping
src=json.load(open(sys.argv[1]))
f=next(f for f in src['features'] if f['properties']['admin']=='Georgia' and f['properties']['name']=='Kakheti')
g=shape(f['geometry']);p=g.representative_point()
feature={'type':'Feature','properties':{'slug':'kakheti-georgie','name':'Kakheti','source':'https://wine.gov.ge/En/Wine/9','sourceIds':['NWA-PDO-789:section-4','NE-v5.1.2:Kakheti'],'resolution':'municipality','sourceYear':2023,'labelLonLat':[p.x,p.y],'scope':'NWA PDO specification section 4: Akhmeta, Telavi, Gurjaani, Sighnaghi, Dedoplistskaro, Kvareli, Lagodekhi, Sagarejo. Simplified regional union from Natural Earth; geographic PDO extent, not vineyard parcels or the 200-750m cultivation mask.','specification':'https://wine.gov.ge/En/Files/Download/15321'},'geometry':mapping(g)}
out=Path(__file__).resolve().parents[2]/'src/data/atlas/wine-areas/georgie.geojson'
out.write_text(json.dumps({'type':'FeatureCollection','features':[feature]},separators=(',',':'))+'\n')
print('Kakheti: saved official PDO geographic extent with provenance')
