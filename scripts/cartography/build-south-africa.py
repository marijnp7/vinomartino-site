#!/usr/bin/env python3
"""Extract wine districts/wards from the public web map embedded by SAWIS.
Source: https://www.sawis.co.za/cert/productionareas.php
Download its linked ArcGIS item 77d24f54b9424c69b9a650242d3ceb21/data?f=json
and pass the local JSON path. Embedded geometries use EPSG:3857.
"""
import json,sys
from pathlib import Path
from shapely.geometry import Polygon,mapping
from shapely.ops import unary_union,transform
from pyproj import Transformer
x=json.load(open(sys.argv[1]));layers={}
def walk(v):
 if isinstance(v,dict):
  if 'featureSet' in v:layers[v['layerDefinition']['name']]=v['featureSet']['features']
  for vv in v.values():walk(vv)
 elif isinstance(v,list):
  for vv in v:walk(vv)
walk(x)
selections=[('swartland','Swartland','Districts','District',['Swartland']),('paarl','Paarl','Districts','District',['Paarl']),
 ('stellenbosch','Stellenbosch','Districts','District',['Stellenbosch']),('franschhoek','Franschhoek','Districts','District',['Franschhoek']),
 ('constantia','Constantia','Wards','Ward',['Constantia']),('hemel-en-aarde','Hemel-en-Aarde','Wards','Ward',['Hemel-en-Aarde Valley','Upper Hemel-en-Aarde Valley','Hemel-en-Aarde Ridge'])]
convert=Transformer.from_crs(3857,4326,always_xy=True).transform
out=Path(__file__).resolve().parents[2]/'src/data/atlas/wine-areas/zuid-afrika.geojson';features=[]
for slug,name,layer,field,names in selections:
 selected=[f for f in layers[layer] if f['attributes'].get(field) in names]
 assert len(selected)==len(names),(slug,len(selected))
 geoms=[]
 for f in selected:
  # ESRI rings use clockwise exteriors and anticlockwise holes. Symmetric
  # difference preserves both disjoint shells and holes without winding guesses.
  g=Polygon()
  for ring in f['geometry']['rings']:g=g.symmetric_difference(Polygon(ring).buffer(0))
  geoms.append(g)
 geom=transform(convert,unary_union(geoms).simplify(100,preserve_topology=True))
 point=geom.representative_point()
 features.append({'type':'Feature','properties':{'slug':slug,'name':name,'source':'https://www.sawis.co.za/cert/productionareas.php',
  'sourceIds':[f"{layer}:{f['attributes']['OBJECTID']}" for f in selected], 'resolution':'wine-origin',
  'sourceYear':2018,'labelLonLat':[point.x,point.y],'scope':'Wine of Origin district or union of named wards; SAWIS embedded public webmap (item updated 2018), retrieved 2026-10-10.'},'geometry':mapping(geom)})
 out.write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':'))+'\n')
 print(slug,geom.bounds)
