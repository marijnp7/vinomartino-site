#!/usr/bin/env python3
"""Build reproducible, municipality-level wine areas, never province proxies.

Requires geopandas, pyogrio, shapely, pyproj. Download the original CC0 files:
  https://ndownloader.figshare.com/files/35955185 -> EU_PDO.gpkg
  https://ndownloader.figshare.com/files/35191360 -> PDO_EU_id.csv
Natural Earth v5.1.2 admin-1 is used ONLY to clip broad Italian regional guides
and Bourgogne's three departments (the generic Bourgogne PDO also allows
Beaujolais). No province is promoted into a wine polygon.
Run: python scripts/cartography/build-wine-areas.py /path/to/source-cache
"""
import csv, json, sys
from pathlib import Path
import geopandas as gpd
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

cache = Path(sys.argv[1])
root = Path(__file__).resolve().parents[2]
rows = list(csv.DictReader((cache/'PDO_EU_id.csv').open(encoding='utf-8-sig')))
pdos = gpd.read_file(cache/'EU_PDO.gpkg').set_index('PDOid')
lookup = {(r['Country'],r['PDOnam']):r['PDOid'] for r in rows}
admin = gpd.read_file(cache/'ne-admin1.geojson').to_crs(pdos.crs)
out = root/'src/data/atlas/wine-areas'
out.mkdir(parents=True,exist_ok=True)
source = 'https://doi.org/10.6084/m9.figshare.19312094'
features = {}

def area(country,slug,name,code,names=None,ids=None,clip=None,note=None):
    ids = ids or [lookup[(code,n)] for n in names]
    geom = unary_union([pdos.loc[i].geometry for i in ids]).buffer(0)
    if clip is not None: geom = geom.intersection(clip).buffer(0)
    assert not geom.is_empty,slug
    # Topology-preserving 200 m simplification is below one national-map pixel.
    geom=geom.simplify(200,preserve_topology=True)
    point=gpd.GeoSeries([geom.representative_point()],crs=pdos.crs).to_crs(4326).iloc[0]
    geo=gpd.GeoSeries([geom],crs=pdos.crs).to_crs(4326).iloc[0]
    item={'type':'Feature','properties':{'slug':slug,'name':name,'source':source,
      'sourceIds':ids,'resolution':'municipality','sourceYear':2022,
      'labelLonLat':[round(point.x,5),round(point.y,5)],
      'scope':note or 'Union of the named PDO geographical areas; not planted-vineyard parcels.'},'geometry':mapping(geo)}
    features.setdefault(country,[]).append(item)
    # Persist after every region so progress is recoverable.
    (out/f'{country}.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features[country]},ensure_ascii=False,separators=(',',':'))+'\n')
    print(country,slug,len(ids),round(geom.area/1e6),'km2',flush=True)

area('frankrijk','loire','Loire','FR',names=[
 'Muscadet','Muscadet Sèvre et Maine','Muscadet Coteaux de la Loire','Muscadet Côtes de Grandlieu',
 'Gros Plant du Pays nantais',"Coteaux d'Ancenis",'Fiefs Vendéens','Anjou','Anjou Villages','Anjou Villages Brissac',
 'Anjou-Coteaux de la Loire',"Cabernet d'Anjou","Rosé d'Anjou",'Rosé de Loire','Crémant de Loire',
 "Coteaux de l'Aubance",'Coteaux du Layon','Bonnezeaux','Quarts de Chaume','Savennières',
 'Savennières Roche aux Moines','Savennières Coulée de Serrant','Saumur','Saumur-Champigny','Coteaux de Saumur','Cabernet de Saumur',
 'Chinon','Bourgueil','Saint-Nicolas-de-Bourgueil','Touraine','Touraine Noble Joué','Vouvray','Montlouis-sur-Loire',
 'Cheverny','Cour-Cheverny','Valençay','Coteaux du Loir','Jasnières','Coteaux du Vendômois','Orléans','Orléans-Cléry',
 'Sancerre','Pouilly-Fumé / Blanc Fumé de Pouilly','Pouilly-sur-Loire','Menetou-Salon','Quincy','Reuilly',
 'Coteaux du Giennois','Châteaumeillant','Haut-Poitou','Saint-Pourçain',"Côtes d'Auvergne",'Côte Roannaise','Côtes du Forez'])
area('frankrijk','champagne','Champagne','FR',names=['Champagne'])
burgundy_mask=unary_union(admin[(admin.admin=='France') & admin['name'].isin(["Côte-d'Or",'Saône-et-Loire','Yonne'])].geometry)
area('frankrijk','bourgogne','Bourgogne','FR',names=['Bourgogne','Crémant de Bourgogne','Chablis','Petit Chablis','Chablis grand cru','Mâcon'],clip=burgundy_mask,
 note='Bourgogne regional PDOs plus Chablis and Mâcon, restricted to Yonne, Côte-d’Or and Saône-et-Loire: excludes Beaujolais, Jura and Savoie.')
area('frankrijk','rhone','Rhône','FR',names=['Côtes du Rhône','Côtes du Rhône Villages','Côte Rôtie','Condrieu','Château-Grillet','Saint-Joseph',
 'Crozes-Hermitage / Crozes-Ermitage',"Hermitage / Ermitage / L'Hermitage / L'Ermitage",'Cornas','Saint-Péray','Gigondas','Vacqueyras',
 'Châteauneuf-du-Pape','Tavel','Lirac','Vinsobres','Rasteau','Cairanne','Beaumes de Venise','Muscat de Beaumes-de-Venise',
 'Grignan-les-Adhémar','Ventoux','Luberon','Côtes du Vivarais','Costières de Nîmes','Clairette de Bellegarde',
 'Clairette de Die','Crémant de Die','Coteaux de Die','Châtillon-en-Diois'])
area('frankrijk','provence','Provence','FR',names=['Côtes de Provence',"Coteaux d'Aix-en-Provence",'Coteaux Varois en Provence',
 'Bandol','Cassis','Palette','Les Baux de Provence','Bellet / Vin de Bellet','Pierrevert'])
for slug,name,pdo in [('rioja','Rioja','Rioja'),('jerez','Jerez','Jerez-Xérès-Sherry / Jerez / Xérès / Sherry'),('priorat-catalonie','Priorat','Priorat / Priorato'),
 ('ribera-del-duero','Ribera del Duero','Ribera del Duero'),('rueda','Rueda','Rueda'),('bierzo','Bierzo','Bierzo'),('rias-baixas','Rías Baixas','Rías Baixas')]:
 area('spanje',slug,name,'ES',names=[pdo])
for slug,name in [('douro-portugal','Douro'),('alentejo','Alentejo'),('vinho-verde','Vinho Verde')]:area('portugal',slug,name,'PT',names=[name])
area('portugal','lisboa','Lisboa','PT',names=['Colares','Carcavelos','Bucelas','Torres Vedras','Alenquer','Óbidos','Encostas d’Aire','Arruda'],
 note='The eight wine PDOs of the Lisboa wine region (excluding Lourinhã, a spirit denomination). Does not substitute the Lisbon administrative region for the wine region.')
for slug,name in [('mosel-duitsland','Mosel'),('pfalz','Pfalz'),('rheingau','Rheingau')]:area('duitsland',slug,name,'DE',names=[name])
for slug,name in [('burgenland','Burgenland'),('wachau','Wachau'),('kamptal','Kamptal')]:area('oostenrijk',slug,name,'AT',names=[name])
area('slowakije','slowakije','Slowakije','SK',ids=[r['PDOid'] for r in rows if r['Country']=='SK'])
area('italie','langhe-piemonte','Langhe','IT',names=['Langhe'])
area('italie','etna-sicilie','Etna','IT',names=['Etna'])
area('italie','trentino-italie','Trentino-Alto Adige','IT',names=['Trentino',"Alto Adige / dell'Alto Adige / Südtirol / Südtiroler",'Trento','Casteller','Valdadige / Etschtaler'],clip=unary_union(admin[(admin.admin=='Italy') & (admin.region=='Trentino-Alto Adige')].geometry))
# Broad regional guides: all wine PDO land inside the named Italian region.
# Regional DOCs legitimately cover a large area; that is explicitly different
# from claiming the coloured area is all planted with vines.
it=[(r['PDOid'],pdos.loc[r['PDOid']].geometry) for r in rows if r['Country']=='IT']
for reg,slug,name in [('Veneto','veneto-italie','Veneto'),('Toscana','toscane-italie','Toscane'),('Campania','campania-italie','Campania'),
 ('Apulia','puglia-italie','Puglia'),('Sardegna','sardegna-italie','Sardegna'),('Emilia-Romagna','emilia-romagna-italie','Emilia-Romagna'),
 ('Friuli-Venezia Giulia','friuli-italie','Friuli-Venezia Giulia')]:
 mask=unary_union(admin[(admin.admin=='Italy') & (admin.region==reg)].geometry)
 ids=[i for i,g in it if g.intersection(mask).area>1e6]
 area('italie',slug,name,'IT',ids=ids,clip=mask,note=f'Wine PDO areas within {reg}; regional guide, not a single appellation or vineyard footprint.')
