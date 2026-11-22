"""Import only the bundled synthetic fixtures into a fresh isolated server."""
import gzip,json,pathlib,urllib.request
BASE='http://127.0.0.1:3628'
HERE=pathlib.Path(__file__).parent
def api(path,data=None):
    return json.load(urllib.request.urlopen(urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'}),timeout=600))
assert not api('/api/boards')['boards'], 'Use a fresh isolated database; never replace existing data'
for board_id in [1,2]:
    payload=json.loads(gzip.decompress((HERE/f'performance-board-{board_id}.json.gz').read_bytes()))
    result=api('/api/boards/import',payload)
    assert result['board']['id']==board_id
    assert len(result['tickets'])==[1005,10005][board_id-1]
    print(board_id,len(result['tickets']))
