import argparse
import json
import pathlib
from urllib.parse import urlsplit
import struct
import urllib.error
import urllib.request
import zlib

parser = argparse.ArgumentParser(description="Seed an empty, loopback-only synthetic Kanbalone instance.")
parser.add_argument("--origin", default="http://127.0.0.1:3675")
parser.add_argument("--output", required=True, type=pathlib.Path)
parser.add_argument("--markdown", action="store_true", help="Add the separate Markdown and Kanban summary specimen board")
args = parser.parse_args()
origin = urlsplit(args.origin)
if origin.scheme != "http" or origin.hostname != "127.0.0.1" or origin.port is None or origin.path not in ("", "/"):
    parser.error("--origin must be the loopback HTTP origin of the dedicated fixture")
base = f"{origin.scheme}://{origin.netloc}"
stamp = "2026-01-15T12:00:00.000Z"

def api(path, data=None, method=None, expected=None):
    binary = isinstance(data, bytes)
    body = data if binary else json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(base + path, body, {"content-type": "image/png" if binary else "application/json"}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if expected is not None:
                assert response.status == expected, (response.status, path)
            return json.load(response) if response.status != 204 else None
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{path} {error.code}: {error.read().decode()}") from error

def chunk(kind, value):
    return struct.pack(">I",len(value)) + kind + value + struct.pack(">I",zlib.crc32(kind+value))

image_rows = bytearray()
for y in range(72):
    image_rows.extend(b"\x00")
    for x in range(180):
        rgb = (39,115,88) if 10 < x < 170 and 9 < y < 22 else (95,141,182) if 10 < x < 105 and 32 < y < 43 else (229,238,230)
        image_rows.extend(rgb)
image = b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",180,72,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(image_rows))+chunk(b"IEND",b"")
if api("/api/boards")["boards"]:
    raise RuntimeError("Start an instance with a fresh synthetic database before seeding")
if args.output.exists():
    raise FileExistsError(args.output)
attachment = api("/api/attachments", image, expected=201)
boards = {}
lanes = {}
groups = {}
tags = {}
ids = {}
comments = {}

def board(key, name, lane_names, completion=False):
    data = api("/api/boards", {"name":name,"laneNames":lane_names}, expected=201)
    id = data["board"]["id"]
    boards[key] = id
    lanes[key] = [lane["id"] for lane in data["lanes"]]
    if completion:
        lane = api(f"/api/boards/{id}/lanes", {"name":"Done","isCompletionLane":True}, expected=201)
        lanes[key].append(lane["id"])
    return id

def group(board_id, key, name, desc=""):
    id = api(f"/api/boards/{board_id}/groups", {"name":name,"descriptionMarkdown":desc}, expected=201)["id"]
    groups[key] = id
    return id

def tag(board_id, key, name, color=""):
    id = api(f"/api/boards/{board_id}/tags", {"name":name,"color":color}, expected=201)["id"]
    tags[key] = id
    return id

def ticket(key, title, board="design", lane=0, **props):
    created = api(f"/api/boards/{boards[board]}/tickets", {"title":title, "laneId":lanes[board][lane], **props}, expected=201)
    ids[key] = created["id"]
    return created["id"]

def patch(key, **props):
    return api(f"/api/tickets/{ids[key]}", props, "PATCH", 200)

def comment(key, ticket, text):
    comments[key] = api(f"/api/tickets/{ids[ticket]}/comments", {"bodyMarkdown":text}, expected=201)["id"]

a=board("design","Design Studio",["Intake","Production","Review"],True)
b=board("publish","Publishing",["Calendar","Ready"],True)
board("empty","Empty board",["Open"])
design=tag(a,"design","Design","#3B805E")
qa=tag(a,"qa","QA","#385D9C")
draft=tag(a,"draft","Draft")
launch=tag(b,"launch","Launch","#965234")
release_group = group(a,"release","Release readiness", """## 今週の確認項目
- 画面のラベルと説明を確認する
- 公開前に担当間の引き継ぎを確認する

**デモ用の説明です。**
""")
complete_group = group(a,"done","Resolved work")
archive_group = group(a,"arch","Archived work")
group(a,"empty","Empty group")
parent=ticket("parent","公開準備の親課題", lane=3, priority=2, groupId=release_group, tagIds=[design])
ticket("main","レビュー画面の表示を確認する", lane=1, groupId=release_group, parentTicketId=parent, priority=4, tagIds=[design,qa],
    bodyMarkdown=f"""レビュー用の合成課題です。**完了条件**を先に確認します。

- 既定の表示とダークテーマ
- 検索結果とキーボード操作
- [参考ページ](https://example.invalid/catalog)

![Synthetic review card]({attachment["url"]})
""")
ticket("childDone","確認済みの子課題", lane=3, groupId=release_group, parentTicketId=parent, tagIds=[design])
blocker=ticket("blocker","ラベル辞書を更新する", lane=0, groupId=release_group, priority=3, tagIds=[draft])
ticket("long","Locale review checklist for the publishing sequence and final approval of the calendar announcement",lane=2,
    priority=1, groupId=release_group, tagIds=[qa], bodyMarkdown=("公開前の照合項目を記録します。 " * 32)+"末尾の確認欄。")
arch_parent=ticket("archParent","アーカイブした親課題",lane=0,groupId=release_group, tagIds=[qa])
ticket("archChild","残っている子課題",lane=2,parentTicketId=arch_parent,groupId=release_group, tagIds=[qa])
patch("archParent",isArchived=True)
ticket("done","完了したレイアウト",lane=3,groupId=complete_group,tagIds=[design])
ticket("arch","過去の実験",lane=0,groupId=archive_group,tagIds=[draft])
patch("arch",isArchived=True)
loose=ticket("loose","未所属の入力項目",lane=0,priority=3,tagIds=[draft])
ticket("looseDone","未所属の完了課題",lane=3,tagIds=[draft])
patch("main",blockerIds=[blocker],relatedTicketIds=[loose])
ticket("publish","公開のお知らせを予約する",board="publish",lane=0,tagIds=[launch],priority=4,bodyMarkdown="公開日時を合わせます。")
ticket("publishDone","プレビューの承認",board="publish",lane=2,tagIds=[launch])
ticket("publish2","公開ページの導線を点検する",board="publish",lane=1,tagIds=[launch],priority=2)
comment("main1","main","日本語のラベルを確認しました。\n\n> 明暗のテーマで再確認します。")
comment("main2","main","レビュー用の添付です。\n\n![Synthetic review card]("+attachment["url"]+")")
comment("long","long",("共有時に確認した事項です。 " * 42)+"コメントの最後。")
comment("publish","publish","公開予定を確定しました。")

bulk = {
    "formatVersion": 2, "board": {"name": "Windowing sample"},
    "lanes": [{"id":1,"name":"Windowed","position":0,"isCompletionLane":False},
              {"id":2,"name":"Target","position":1,"isCompletionLane":False}],
    "groups":[{"id":1,"name":"Large group","descriptionMarkdown":"A synthetic collection used to display the virtual ticket window.","createdAt":stamp,"updatedAt":stamp}],
    "tags":[],
    "tickets":[{"id":n,"laneId":1 if n<1005 else 2,"priority":1+(n%4),"position":n,
        "groupId":1 if n<1004 else None,"isResolved":False,"isArchived":False,"bodyMarkdown":"",
        "title":f"Repeated sample row {n:04d}" if n!=1003 else "Window end search marker",
        "parentTicketId":None,"tags":[],"comments":[],"blockerIds":[]} for n in range(1,1011)]
}
large=api("/api/boards/import",bulk,expected=201)
boards["large"]=large["board"]["id"]
lanes["large"]=[lane["id"] for lane in large["lanes"]]
groups["large"]=api(f"/api/boards/{boards['large']}/groups")["groups"][0]["id"]

view1={"name":"Release desk","scope":"selected","boardIds":[a,b],"rules":[
        {"boardId":a,"mode":"tags","tagIds":[qa,design],"laneMode":"selected","laneIds":lanes["design"][:3]},
        {"boardId":b,"mode":"all","tagIds":[],"laneMode":"all","laneIds":[]}],
       "completion":"open","showBody":True,"showLatestComment":True,"sort":"position_asc"}
normal=api("/api/custom-views",view1,expected=201)
lane=api(f"/api/boards/{a}/lanes",{"name":"Discontinued"},expected=201)["id"]
broken=api("/api/custom-views",{**view1,"name":"Unavailable lane", "boardIds":[a],
        "rules":[{"boardId":a,"mode":"all","tagIds":[],"laneMode":"selected","laneIds":[lane]}]},expected=201)
api(f"/api/lanes/{lane}",method="DELETE",expected=204)
window_board=boards["large"]
paging=api("/api/custom-views",{**view1,"name":"Paged review","boardIds":[window_board],"showBody":False,"showLatestComment":False,
    "rules":[{"boardId":window_board,"mode":"all","tagIds":[],"laneMode":"all","laneIds":[]}]},expected=201)
manifest={"boards":boards,"lanes":lanes,"tags":tags,"groups":groups,"tickets":ids,"comments":comments,
    "views":{"release":normal["id"],"missing":broken["id"],"page":paging["id"]},"largeTicketCount":1010,
    "attachment":attachment["url"],"syntheticOnly":True}
if args.markdown:
    sample_file = pathlib.Path(__file__).resolve().parent.parent / "markdown-specimen.md"
    sample = sample_file.read_text(encoding="utf-8").split("````markdown\n", 1)[1].split("````", 1)[0]
    start = sample.index("/api/attachments/")
    end = sample.index(")", start)
    sample = sample[:start] + attachment["url"] + sample[end:]
    sample_board = board("markdown", "Markdown specimens", ["Intake"], completion=True)
    sample_group = group(sample_board, "markdown", "Markdown specimens", sample)
    ticket("markdown", "Markdown surfaces", board="markdown", priority=3, bodyMarkdown=sample, groupId=sample_group)
    comment("markdown", "markdown", sample)
    for index in range(1, 10):
        key = f"archiveSample{index}"
        ticket(key, f"Archived sample {index}", board="markdown")
        patch(key, isArchived=True)
    for index in range(1, 7):
        ticket(f"completedSample{index}", f"Completed sample {index}", board="markdown", lane=1)
args.output.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(manifest,ensure_ascii=False))
